import pandas as pd
import pytest

from app.services.selection import (
    ActualBasis,
    SelectionMode,
    build_comparison,
    day_ahead_cutoff,
    hourly_actuals,
    select_forecasts,
)
from tests.conftest import actuals_frame, forecasts_frame, ts


@pytest.mark.parametrize(
    ("target", "cutoff"),
    [
        # Winter: UK time == UTC.
        ("2026-01-15T00:00", "2026-01-14T11:00"),
        ("2026-01-15T23:00", "2026-01-14T11:00"),
        # Summer: 11:00 BST == 10:00 UTC.
        ("2026-06-15T10:00", "2026-06-14T10:00"),
        # 23:30 UTC in summer is 00:30 BST on the next UK day.
        ("2026-06-15T23:30", "2026-06-15T10:00"),
        # Day after clocks go forward (29 Mar 2026): D-1 cutoff is already in BST.
        ("2026-03-30T12:00", "2026-03-29T10:00"),
        # Clocks go back on 25 Oct 2026: D-1 cutoff is still in BST.
        ("2026-10-25T12:00", "2026-10-24T10:00"),
    ],
)
def test_day_ahead_cutoff_uses_uk_calendar_day(target: str, cutoff: str) -> None:
    result = day_ahead_cutoff(pd.Series([ts(target)]))
    assert result.iloc[0] == ts(cutoff)


def test_day_ahead_picks_latest_run_at_or_before_cutoff() -> None:
    f = forecasts_frame(
        [
            ("2026-01-14T07:30", "2026-01-15T12:00", 100),
            ("2026-01-14T09:30", "2026-01-15T12:00", 200),
            ("2026-01-14T11:00", "2026-01-15T12:00", 300),  # exactly at cutoff: allowed
            ("2026-01-14T11:30", "2026-01-15T12:00", 400),  # after cutoff
        ]
    )
    out = select_forecasts(f, SelectionMode.DAY_AHEAD)
    assert out["forecast_mw"].tolist() == [300]
    assert out["lead_h"].tolist() == [25.0]


def test_horizon_excludes_runs_published_after_target() -> None:
    f = forecasts_frame(
        [
            ("2026-01-15T09:30", "2026-01-15T12:00", 100),
            ("2026-01-15T15:30", "2026-01-15T12:00", 999),  # restates a past hour
        ]
    )
    out = select_forecasts(f, SelectionMode.HORIZON, horizon_h=0)
    assert out["forecast_mw"].tolist() == [100]
    assert (out["lead_h"] >= 0).all()


def test_horizon_requires_minimum_lead_time() -> None:
    f = forecasts_frame(
        [
            ("2026-01-15T02:30", "2026-01-15T12:00", 100),  # 9.5h ahead
            ("2026-01-15T04:30", "2026-01-15T12:00", 200),  # 7.5h ahead
            ("2026-01-15T07:30", "2026-01-15T12:00", 300),  # 4.5h ahead
        ]
    )
    assert select_forecasts(f, SelectionMode.HORIZON, 6)["forecast_mw"].tolist() == [200]
    assert select_forecasts(f, SelectionMode.HORIZON, 7.5)["forecast_mw"].tolist() == [200]
    assert select_forecasts(f, SelectionMode.HORIZON, 8)["forecast_mw"].tolist() == [100]
    assert select_forecasts(f, SelectionMode.HORIZON, 10).empty


def test_horizon_out_of_range_rejected() -> None:
    with pytest.raises(ValueError):
        select_forecasts(forecasts_frame([]), SelectionMode.HORIZON, -1)


def test_hourly_actuals_point_and_mean() -> None:
    a = actuals_frame(
        [
            ("2026-01-15T00:00", 100),
            ("2026-01-15T00:30", 300),
            ("2026-01-15T01:00", 500),  # second half-hour missing
        ]
    )
    assert hourly_actuals(a, ActualBasis.POINT).tolist() == [100, 500]
    mean = hourly_actuals(a, ActualBasis.HOUR_MEAN)
    assert mean.tolist() == [200]
    assert mean.index[0] == ts("2026-01-15T00:00")


def test_build_comparison_joins_errors_and_counts_missing() -> None:
    f = forecasts_frame(
        [
            ("2026-01-14T09:30", "2026-01-15T00:00", 1000),
            # 01:00 only has a forecast published after the cutoff.
            ("2026-01-14T15:30", "2026-01-15T01:00", 1000),
            ("2026-01-14T09:30", "2026-01-15T02:00", 1000),
        ]
    )
    a = actuals_frame(
        [("2026-01-15T00:00", 1200), ("2026-01-15T01:00", 900), ("2026-01-15T02:00", 700)]
    )
    cmp = build_comparison(f, a, SelectionMode.DAY_AHEAD)
    assert cmp.frame["error_mw"].tolist() == [200, -300]
    assert (cmp.target_hours, cmp.matched_hours, cmp.missing_hours) == (3, 2, 1)


def test_build_comparison_window_is_half_open() -> None:
    f = forecasts_frame(
        [("2026-01-14T09:30", f"2026-01-15T0{h}:00", 1) for h in range(3)]
    )
    a = actuals_frame([(f"2026-01-15T0{h}:00", 1) for h in range(3)])
    cmp = build_comparison(
        f, a, SelectionMode.DAY_AHEAD, start=ts("2026-01-15T01:00"), end=ts("2026-01-15T02:00")
    )
    assert cmp.frame["start_time"].tolist() == [ts("2026-01-15T01:00")]
    assert cmp.target_hours == 1
