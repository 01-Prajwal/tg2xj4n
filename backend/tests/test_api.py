"""API tests against a small synthetic snapshot injected via dependency override.

Fixture: one delivery day (15 Jan 2026), actual output 900 MW every half-hour, and
three forecast runs for every hour of that day:
  14 Jan 09:30 -> 1000 MW  (the day-ahead choice: last run before 11:00 on D-1)
  14 Jan 15:30 -> 1100 MW
  15 Jan 07:30 -> 1200 MW  (only usable for target hours after 07:30)
"""

from collections.abc import Iterator
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.data.repository import get_snapshot
from app.data.snapshot import Snapshot, SnapshotMeta
from app.main import create_app
from tests.conftest import actuals_frame, forecasts_frame

DAY = "2026-01-15"
RUNS = [("2026-01-14T09:30", 1000), ("2026-01-14T15:30", 1100), ("2026-01-15T07:30", 1200)]


def synthetic_snapshot() -> Snapshot:
    hours = [f"{DAY}T{h:02d}:00" for h in range(24)]
    forecasts = forecasts_frame([(p, t, mw) for p, mw in RUNS for t in hours])
    halves = pd.date_range(DAY, periods=48, freq="30min", tz="UTC")
    actuals = actuals_frame([(t.isoformat(), 900) for t in halves])
    meta = SnapshotMeta("2026-10-26T00:00:00+00:00", "test", 48, "", "", 72, 3, "", "")
    return Snapshot(actuals=actuals, forecasts=forecasts, meta=meta)


@pytest.fixture
def client() -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[get_snapshot] = synthetic_snapshot
    with TestClient(app) as c:
        yield c


def test_health(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["snapshot"]["forecast_runs"] == 3
    assert body["default_window"]["start"].startswith("2026-01-02T00:00:00")
    assert body["default_window"]["end"].startswith("2026-02-02T00:00:00")


def test_series_day_ahead_uses_0930_run(client: TestClient) -> None:
    body = client.get("/api/series").json()
    assert body["query"]["mode"] == "dayahead"
    assert body["coverage"] == {"target_hours": 24, "matched_hours": 24, "missing_hours": 0}
    first = body["points"][0]
    assert first["forecast_mw"] == 1000
    assert first["error_mw"] == -100
    assert first["publish_time"].startswith("2026-01-14T09:30")
    assert first["lead_h"] == 14.5
    # Every error is -100, so the band collapses onto forecast - 100.
    assert first["reliable_mw"] == 900


def test_series_horizon_mode_uses_newest_run_available(client: TestClient) -> None:
    points = client.get("/api/series", params={"mode": "horizon", "h": 0}).json()["points"]
    by_hour = {p["start_time"][11:13]: p["forecast_mw"] for p in points}
    assert by_hour["07"] == 1100  # 07:30 run not yet published
    assert by_hour["08"] == 1200


def test_horizon_ignored_in_day_ahead_mode(client: TestClient) -> None:
    body = client.get("/api/series", params={"mode": "dayahead", "h": 30}).json()
    assert body["query"]["horizon_h"] == 0


def test_window_filters_targets(client: TestClient) -> None:
    body = client.get(
        "/api/series", params={"from": f"{DAY}T06:00:00Z", "to": f"{DAY}T09:00:00Z"}
    ).json()
    assert [p["start_time"][11:16] for p in body["points"]] == ["06:00", "07:00", "08:00"]


@pytest.mark.parametrize(
    "params",
    [
        {"mode": "weekly"},
        {"mode": "horizon", "h": -1},
        {"mode": "horizon", "h": 500},
        {"basis": "median"},
        {"from": f"{DAY}T10:00:00Z", "to": f"{DAY}T09:00:00Z"},
        {"from": "not-a-date"},
    ],
)
def test_invalid_params_rejected(client: TestClient, params: dict[str, object]) -> None:
    assert client.get("/api/series", params=params).status_code == 422


def test_metrics(client: TestClient) -> None:
    body = client.get("/api/metrics", params={"bin_width": 100}).json()
    s = body["summary"]
    assert s["n"] == 24
    assert s["mae_mw"] == 100
    assert s["bias_mw"] == -100
    assert s["max_over_forecast_mw"] == 100
    assert sum(b["count"] for b in body["histogram"]) == 24


def test_metrics_empty_window_returns_nulls(client: TestClient) -> None:
    body = client.get(
        "/api/metrics", params={"from": "2026-01-20T00:00:00Z", "to": "2026-01-21T00:00:00Z"}
    ).json()
    assert body["summary"]["n"] == 0
    assert body["summary"]["mae_mw"] is None
    assert body["histogram"] == []


def test_metrics_by_hour_has_24_rows(client: TestClient) -> None:
    hours = client.get("/api/metrics/by-hour", params={"mode": "horizon"}).json()["hours"]
    assert [h["hour"] for h in hours] == list(range(24))
    assert hours[0]["bias_mw"] == -200
    assert hours[23]["bias_mw"] == -300


def test_metrics_by_hour_null_for_hours_without_data(client: TestClient) -> None:
    hours = client.get(
        "/api/metrics/by-hour", params={"from": f"{DAY}T00:00:00Z", "to": f"{DAY}T02:00:00Z"}
    ).json()["hours"]
    assert hours[5] == {
        "hour": 5, "n": 0, "mae_mw": None, "bias_mw": None, "p10_mw": None, "p90_mw": None
    }


def test_metrics_by_horizon(client: TestClient) -> None:
    rows = client.get("/api/metrics/by-horizon", params={"max_h": 12, "step": 6}).json()[
        "horizons"
    ]
    assert [r["horizon_h"] for r in rows] == [0, 6, 12]
    assert rows[0]["coverage_pct"] == 100


def test_forecast_vintages(client: TestClient) -> None:
    body = client.get("/api/forecast-vintages", params={"target": f"{DAY}T12:00:00Z"}).json()
    assert body["actual_mw"] == 900
    assert body["day_ahead_cutoff"].startswith("2026-01-14T11:00")
    assert body["day_ahead_choice"].startswith("2026-01-14T09:30")
    assert [v["forecast_mw"] for v in body["vintages"]] == [1000, 1100, 1200]
    assert [v["before_day_ahead_cutoff"] for v in body["vintages"]] == [True, False, False]


def test_forecast_vintages_unknown_target_404(client: TestClient) -> None:
    resp = client.get("/api/forecast-vintages", params={"target": "2030-01-01T00:00:00Z"})
    assert resp.status_code == 404


def test_decision_at_cutoff_uses_0930_run(client: TestClient) -> None:
    body = client.get("/api/decision", params={"decision_time": "2026-01-14T11:00:00Z"}).json()
    assert body["delivery_day"] == DAY
    assert body["run_publish_time"].startswith("2026-01-14T09:30")
    assert body["next_run_publish_time"].startswith("2026-01-14T15:30")
    assert body["expected_hours"] == 24
    assert len(body["hours"]) == 24
    assert body["hours"][0]["forecast_mw"] == 1000
    assert [r["publish_time"][11:16] for r in body["runs"]] == ["09:30"]
    # The fixture has no actuals before 14 Jan, so no errors are known yet.
    assert body["error_model"]["n"] == 0
    assert body["hours"][0]["low_mw"] is None
    assert body["totals"]["forecast_mwh"] == 24_000
    assert body["totals"]["count_on_mwh"] is None


def test_decision_later_in_day_sees_newer_run(client: TestClient) -> None:
    body = client.get("/api/decision", params={"decision_time": "2026-01-14T16:00:00Z"}).json()
    assert body["run_publish_time"].startswith("2026-01-14T15:30")
    assert body["hours"][0]["forecast_mw"] == 1100


@pytest.mark.parametrize(
    "params",
    [
        {"decision_time": "2026-02-01T11:00:00Z"},
        {"decision_time": "2025-12-31T11:00:00Z"},
        {"confidence": 1.5},
        {"lookback_days": 1},
    ],
)
def test_decision_rejects_out_of_scope_params(
    client: TestClient, params: dict[str, object]
) -> None:
    assert client.get("/api/decision", params=params).status_code == 422


def test_decision_backtest_covers_every_january_decision(client: TestClient) -> None:
    body = client.get("/api/decision/backtest", params={"confidence": 0.8}).json()
    assert body["confidence"] == 0.8
    assert len(body["days"]) == 31
    assert body["days"][0]["decision_day"] == "2026-01-01"


def test_serves_frontend_build_when_present(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / "index.html").write_text("<!doctype html><title>Wind</title>")
    monkeypatch.setattr(settings, "frontend_dist", tmp_path)
    app = create_app()
    app.dependency_overrides[get_snapshot] = synthetic_snapshot
    with TestClient(app) as c:
        assert "<title>Wind</title>" in c.get("/").text
        assert c.get("/api/health").json()["status"] == "ok"


def test_missing_snapshot_returns_503() -> None:
    def missing() -> Snapshot:
        raise FileNotFoundError("Snapshot incomplete")

    app = create_app()
    app.dependency_overrides[get_snapshot] = missing
    with TestClient(app) as c:
        resp = c.get("/api/health")
    assert resp.status_code == 503
    assert "Snapshot" in resp.json()["detail"]
