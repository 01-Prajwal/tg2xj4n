"""Pick, for each target hour, the forecast that was actually available in time.

Two rules decide what "in time" means:

* DAY_AHEAD: the latest forecast published at or before 11:00 UK time on the day
  before delivery (when the day-ahead auction closes). This is what the trader saw.
* HORIZON: the latest forecast published at least `horizon_h` hours before the
  target. Sweeping `horizon_h` shows how accuracy decays with lead time.

In both modes a forecast is only eligible if it was published before its target:
each WINDFOR run also re-states ~25h of past hours, which are not forecasts.

All functions are pure (DataFrame in, DataFrame out) so they can be unit tested
without I/O.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

import pandas as pd

from app.config import DAY_AHEAD_CUTOFF_HOUR, MAX_HORIZON_HOURS, UK_TZ

COMPARISON_COLUMNS = [
    "start_time",
    "actual_mw",
    "forecast_mw",
    "error_mw",
    "publish_time",
    "lead_h",
]


class SelectionMode(StrEnum):
    DAY_AHEAD = "dayahead"
    HORIZON = "horizon"


class ActualBasis(StrEnum):
    """How a half-hourly actual is matched to an hourly forecast."""

    POINT = "point"  # the half-hour starting on the hour
    HOUR_MEAN = "hour_mean"  # mean of both half-hours in the hour


@dataclass(frozen=True)
class Comparison:
    """Matched forecast/actual pairs plus how many target hours had no forecast."""

    frame: pd.DataFrame
    target_hours: int

    @property
    def matched_hours(self) -> int:
        return len(self.frame)

    @property
    def missing_hours(self) -> int:
        return self.target_hours - self.matched_hours


def day_ahead_cutoff(
    start_times: pd.Series, cutoff_hour: int = DAY_AHEAD_CUTOFF_HOUR
) -> pd.Series:
    """For each UTC target time, the UTC moment of `cutoff_hour`:00 UK time on D-1.

    The delivery day D is the target's UK calendar day, so this is correct across
    the GMT/BST change. The cutoff hour itself never falls in a DST gap.
    """
    local = start_times.dt.tz_convert(UK_TZ).dt.tz_localize(None)
    cutoff_local = local.dt.normalize() - pd.Timedelta(days=1) + pd.Timedelta(hours=cutoff_hour)
    cutoff: pd.Series = cutoff_local.dt.tz_localize(UK_TZ).dt.tz_convert("UTC")
    return cutoff


def select_forecasts(
    forecasts: pd.DataFrame,
    mode: SelectionMode,
    horizon_h: float = 0,
    cutoff_hour: int = DAY_AHEAD_CUTOFF_HOUR,
) -> pd.DataFrame:
    """One row per target hour: the chosen forecast, when it was published, its lead time."""
    if not 0 <= horizon_h <= MAX_HORIZON_HOURS:
        raise ValueError(f"horizon_h must be within 0..{MAX_HORIZON_HOURS}, got {horizon_h}")

    start, publish = forecasts["start_time"], forecasts["publish_time"]
    if mode is SelectionMode.DAY_AHEAD:
        deadline = day_ahead_cutoff(start, cutoff_hour)
    else:
        deadline = start - pd.Timedelta(hours=horizon_h)

    eligible = forecasts[(publish <= deadline) & (publish <= start)]
    latest = eligible.sort_values("publish_time").drop_duplicates("start_time", keep="last")
    return (
        latest.assign(
            forecast_mw=latest["generation_mw"],
            lead_h=(latest["start_time"] - latest["publish_time"]).dt.total_seconds() / 3600,
        )[["start_time", "forecast_mw", "publish_time", "lead_h"]]
        .sort_values("start_time")
        .reset_index(drop=True)
    )


def hourly_actuals(actuals: pd.DataFrame, basis: ActualBasis = ActualBasis.POINT) -> pd.Series:
    """Half-hourly actuals reduced to hourly values indexed by UTC hour start."""
    series = actuals.set_index("start_time")["generation_mw"].sort_index()
    if basis is ActualBasis.POINT:
        on_the_hour = pd.DatetimeIndex(series.index).minute == 0
        return series[on_the_hour].rename("actual_mw")
    grouped = series.resample("1h")
    # Only hours with both half-hours present; a single half-hour is not an hourly mean.
    mean = grouped.mean()[grouped.count() == 2]
    return mean.rename("actual_mw")


def build_comparison(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    mode: SelectionMode,
    horizon_h: float = 0,
    start: datetime | None = None,
    end: datetime | None = None,
    basis: ActualBasis = ActualBasis.POINT,
) -> Comparison:
    """Selected forecasts joined to actuals for target hours in [start, end)."""
    actual = hourly_actuals(actuals, basis)
    if start is not None:
        actual = actual[actual.index >= pd.Timestamp(start)]
    if end is not None:
        actual = actual[actual.index < pd.Timestamp(end)]

    selected = select_forecasts(forecasts, mode, horizon_h)
    frame = selected.merge(
        actual.rename_axis("start_time").reset_index(), on="start_time", how="inner"
    )
    frame = frame.assign(error_mw=frame["actual_mw"] - frame["forecast_mw"])
    return Comparison(frame=frame[COMPARISON_COLUMNS], target_hours=len(actual))
