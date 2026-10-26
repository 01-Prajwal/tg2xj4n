import math
from datetime import date

import pandas as pd
import pytest

from app.services.decision import (
    backtest,
    decision_view,
    delivery_window,
    energy_totals,
    error_model,
)
from tests.conftest import actuals_frame, forecasts_frame, ts


def history(rows: list[tuple[str, float]]) -> pd.DataFrame:
    """Day-ahead comparison rows of (start_time, error_mw)."""
    return pd.DataFrame(
        {
            "start_time": pd.to_datetime([s for s, _ in rows], utc=True),
            "error_mw": [float(e) for _, e in rows],
        }
    )


def test_delivery_window_is_the_next_uk_day() -> None:
    day, start, end = delivery_window(ts("2026-01-14T11:00"))
    assert day == date(2026, 1, 15)
    assert (start, end) == (ts("2026-01-15T00:00"), ts("2026-01-16T00:00"))


def test_delivery_window_spring_forward_day_has_23_hours() -> None:
    day, start, end = delivery_window(ts("2026-03-28T11:00"))
    assert day == date(2026, 3, 29)
    assert (end - start) == pd.Timedelta(hours=23)


def test_error_model_uses_only_errors_known_at_decision_time() -> None:
    t = ts("2026-01-14T11:00")
    h = history(
        [
            ("2026-01-10T00:00", 999),  # outside a 3-day lookback
            ("2026-01-12T00:00", -300),
            ("2026-01-13T00:00", -100),
            ("2026-01-14T10:00", 100),  # known at 10:30
            ("2026-01-14T11:00", 5000),  # only known at 11:30: excluded
            ("2026-01-15T00:00", 7000),  # the future
        ]
    )
    m = error_model(h, t, lookback_days=3, confidence=0.9)
    assert m.n == 3
    assert m.median_mw == -100
    assert m.bias_mw == pytest.approx(-100)
    assert m.window_start == ts("2026-01-11T11:00")


def test_error_model_without_history_has_no_band() -> None:
    m = error_model(history([]), ts("2026-01-14T11:00"), 30, 0.9)
    assert m.n == 0 and m.low_mw is None


def _fixture() -> tuple[pd.DataFrame, pd.DataFrame]:
    # Delivery day 15 Jan, 2 hours only. Runs: 07:30 and 09:30 before the decision,
    # 11:30 after it.
    hours = ["2026-01-15T00:00", "2026-01-15T01:00"]
    runs = [("2026-01-14T07:30", 900), ("2026-01-14T09:30", 1000), ("2026-01-14T11:30", 5000)]
    f = forecasts_frame([(p, h, mw) for p, mw in runs for h in hours])
    # History: forecasts for 13 Jan from the 12 Jan run, actual 200 MW below forecast.
    past = [f"2026-01-13T0{h}:00" for h in range(4)]
    f = pd.concat([f, forecasts_frame([("2026-01-12T09:30", h, 1200) for h in past])])
    a = actuals_frame([(h, 1000) for h in past] + [(hours[0], 700)])
    return f.reset_index(drop=True), a


def test_decision_view_uses_latest_run_published_by_decision_time() -> None:
    f, a = _fixture()
    v = decision_view(f, a, ts("2026-01-14T11:00"), confidence=0.9, lookback_days=7)
    assert v.run_publish_time == ts("2026-01-14T09:30")
    assert v.next_run_publish_time == ts("2026-01-14T11:30")
    assert v.hours["forecast_mw"].tolist() == [1000, 1000]
    assert v.hours["lead_h"].tolist() == [14.5, 15.5]
    assert v.runs["publish_time"].tolist() == [ts("2026-01-14T07:30"), ts("2026-01-14T09:30")]
    # Every known error was -200, so the whole band sits 200 MW below the forecast.
    assert v.model.n == 4
    assert v.hours["low_mw"].tolist() == [800, 800]
    assert v.hours["median_mw"].tolist() == [800, 800]
    # Hindsight actuals: present for 00:00, missing for 01:00.
    assert v.hours["actual_mw"].iloc[0] == 700
    assert math.isnan(v.hours["actual_mw"].iloc[1])


def test_energy_totals() -> None:
    f, a = _fixture()
    v = decision_view(f, a, ts("2026-01-14T11:00"), confidence=0.9, lookback_days=7)
    e = energy_totals(v.hours)
    assert e.forecast_mwh == 2000
    assert e.count_on_mwh == 1600
    assert e.extra_cover_mwh == 400
    assert e.actual_mwh is None  # 01:00 actual missing
    assert e.hours_below_count_on is None


def test_backtest_scores_each_decision_day() -> None:
    f, a = _fixture()
    a = pd.concat([a, actuals_frame([("2026-01-15T01:00", 900)])]).reset_index(drop=True)
    out = backtest(f, a, [date(2026, 1, 14)], decision_hour=11, confidence=0.9, lookback_days=7)
    row = out.iloc[0]
    assert row["delivery_day"] == date(2026, 1, 15)
    assert row["hours"] == 2
    # Count-on line is 800 MW: 700 is below it, 900 is above.
    assert row["hours_above_count_on"] == 1
    assert row["actual_mwh"] == 1600
