from datetime import UTC, date, datetime

import httpx
import pytest

from app.data.elexon import (
    ElexonClient,
    ElexonError,
    _date_chunks,
    _datetime_chunks,
    normalise_actuals,
    normalise_forecasts,
)


def actual(start: str, gen: float, publish: str | None = None, fuel: str = "WIND") -> dict:
    return {
        "dataset": "FUELHH",
        "publishTime": publish or start,
        "startTime": start,
        "settlementDate": start[:10],
        "settlementPeriod": 1,
        "fuelType": fuel,
        "generation": gen,
    }


def forecast(publish: str, start: str, gen: float) -> dict:
    return {"dataset": "WINDFOR", "publishTime": publish, "startTime": start, "generation": gen}


def test_date_chunks_cover_range_without_overlap() -> None:
    chunks = list(_date_chunks(date(2026, 1, 1), date(2026, 1, 16), 7))
    assert chunks == [
        (date(2026, 1, 1), date(2026, 1, 7)),
        (date(2026, 1, 8), date(2026, 1, 14)),
        (date(2026, 1, 15), date(2026, 1, 16)),
    ]


def test_datetime_chunks_are_half_open() -> None:
    a, b = datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 10, tzinfo=UTC)
    chunks = list(_datetime_chunks(a, b, 7))
    assert chunks[0] == (a, datetime(2026, 1, 8, tzinfo=UTC))
    assert chunks[-1][1] == b
    assert all(x[1] == y[0] for x, y in zip(chunks, chunks[1:], strict=False))


def test_normalise_actuals_filters_wind_and_keeps_latest_revision() -> None:
    df = normalise_actuals(
        [
            actual("2026-01-01T00:30:00Z", 200),
            actual("2026-01-01T00:00:00Z", 100, publish="2026-01-01T00:30:00Z"),
            actual("2026-01-01T00:00:00Z", 110, publish="2026-01-01T02:00:00Z"),
            actual("2026-01-01T00:00:00Z", 999, fuel="CCGT"),
        ]
    )
    assert df["generation_mw"].tolist() == [110.0, 200.0]
    assert str(df["start_time"].dt.tz) == "UTC"


def test_normalise_forecasts_dedupes_and_sorts() -> None:
    df = normalise_forecasts(
        [
            forecast("2026-01-01T09:30:00Z", "2026-01-02T01:00:00Z", 5),
            forecast("2026-01-01T07:30:00Z", "2026-01-02T00:00:00Z", 3),
            forecast("2026-01-01T07:30:00Z", "2026-01-02T00:00:00Z", 4),
        ]
    )
    assert len(df) == 2
    assert df["generation_mw"].tolist() == [4.0, 5.0]


def test_empty_payloads_give_typed_empty_frames() -> None:
    assert normalise_actuals([]).empty
    assert normalise_forecasts([]).empty


def make_client(handler) -> ElexonClient:  # type: ignore[no-untyped-def]
    http = httpx.Client(base_url="https://test", transport=httpx.MockTransport(handler))
    return ElexonClient(client=http, chunk_days=7, max_retries=2)


def test_fetch_actuals_sends_one_request_per_chunk() -> None:
    seen: list[dict[str, str]] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(dict(req.url.params))
        day = req.url.params["settlementDateFrom"]
        return httpx.Response(200, json=[actual(f"{day}T00:00:00Z", 1)])

    df = make_client(handler).fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 10))
    assert [p["settlementDateFrom"] for p in seen] == ["2026-01-01", "2026-01-08"]
    assert all(p["fuelType"] == "WIND" for p in seen)
    assert len(df) == 2


def test_fetch_forecasts_chunk_bounds_do_not_overlap() -> None:
    seen: list[tuple[str, str]] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append((req.url.params["publishDateTimeFrom"], req.url.params["publishDateTimeTo"]))
        return httpx.Response(200, json=[])

    make_client(handler).fetch_wind_forecasts(
        datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 15, tzinfo=UTC)
    )
    assert seen == [
        ("2026-01-01T00:00:00Z", "2026-01-07T23:59:59Z"),
        ("2026-01-08T00:00:00Z", "2026-01-14T23:59:59Z"),
    ]


def test_retries_then_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.data.elexon.time.sleep", lambda _: None)
    calls = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(503)

    with pytest.raises(ElexonError):
        make_client(handler).fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 1))
    assert calls == 2
