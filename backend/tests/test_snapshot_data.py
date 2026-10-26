"""Checks against the bundled January 2026 snapshot (skipped if it is not present)."""

from datetime import UTC, datetime, time, timedelta

import pytest

from app.config import DELIVERY_FIRST_DAY, DELIVERY_LAST_DAY, settings
from app.data.snapshot import load_snapshot
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


def test_short_horizon_is_more_accurate_than_day_ahead() -> None:
    assert SNAPSHOT is not None
    f, a = SNAPSHOT.forecasts, SNAPSHOT.actuals
    window = {"start": START, "end": END}
    day_ahead = summarise(build_comparison(f, a, SelectionMode.DAY_AHEAD, **window).frame)
    near = summarise(build_comparison(f, a, SelectionMode.HORIZON, 1, **window).frame)
    assert near.mae_mw is not None and day_ahead.mae_mw is not None
    assert near.mae_mw < day_ahead.mae_mw
