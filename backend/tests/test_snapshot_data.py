"""Checks against the bundled January 2026 snapshot (skipped if it is not present)."""

from datetime import UTC, date, datetime, time, timedelta

import pytest

from app.config import DELIVERY_FIRST_DAY, DELIVERY_LAST_DAY, settings
from app.data.snapshot import load_snapshot
from app.services.decision import backtest, decision_view
from app.services.metrics import summarise
from app.services.selection import SelectionMode, build_comparison

try:
    SNAPSHOT = load_snapshot(settings.data_dir)
except FileNotFoundError:
    SNAPSHOT = None

pytestmark = pytest.mark.skipif(SNAPSHOT is None, reason="no data snapshot")

START = datetime.combine(DELIVERY_FIRST_DAY, time(), UTC)
END = datetime.combine(DELIVERY_LAST_DAY + timedelta(days=1), time(), UTC)


def test_every_delivery_hour_has_a_day_ahead_forecast() -> None:
    assert SNAPSHOT is not None
    cmp = build_comparison(
        SNAPSHOT.forecasts, SNAPSHOT.actuals, SelectionMode.DAY_AHEAD, start=START, end=END
    )
    assert cmp.target_hours == 31 * 24
    assert cmp.missing_hours == 0
    # Chosen run is normally 09:30 on D-1: 14.5h ahead of 00:00 and 37.5h ahead of 23:00.
    assert cmp.frame["lead_h"].between(13, 40).all()


def test_every_january_decision_has_a_full_forecast_and_history() -> None:
    assert SNAPSHOT is not None
    for day in range(1, 32):
        t = datetime(2026, 1, day, 11, tzinfo=UTC)
        v = decision_view(SNAPSHOT.forecasts, SNAPSHOT.actuals, t)
        assert len(v.hours) == v.expected_hours == 24
        assert v.model.n >= 24 * 29  # ~30 days of known hourly errors


def test_90pct_band_is_roughly_calibrated_out_of_sample() -> None:
    assert SNAPSHOT is not None
    days = [date(2026, 1, d) for d in range(1, 32)]
    out = backtest(SNAPSHOT.forecasts, SNAPSHOT.actuals, days, 11, 0.9, 30)
    hit = out["hours_above_count_on"].sum() / out["hours"].sum()
    assert 0.85 <= hit <= 0.95


def test_short_horizon_is_more_accurate_than_day_ahead() -> None:
    assert SNAPSHOT is not None
    f, a = SNAPSHOT.forecasts, SNAPSHOT.actuals
    window = {"start": START, "end": END}
    day_ahead = summarise(build_comparison(f, a, SelectionMode.DAY_AHEAD, **window).frame)
    near = summarise(build_comparison(f, a, SelectionMode.HORIZON, 1, **window).frame)
    assert near.mae_mw is not None and day_ahead.mae_mw is not None
    assert near.mae_mw < day_ahead.mae_mw
