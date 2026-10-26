"""Forecast accuracy measures over a Comparison frame.

Sign convention: error = actual - forecast. Positive means wind came in above
forecast (the forecast was too low, so the client over-bought from the market).
"""

import math
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime

import numpy as np
import pandas as pd

from app.config import UK_TZ
from app.services.selection import ActualBasis, SelectionMode, build_comparison

QUANTILES = (0.1, 0.5, 0.9)


@dataclass(frozen=True)
class ErrorSummary:
    n: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    nmae_pct: float | None  # MAE as % of mean actual; MAPE is unstable near zero wind
    mean_actual_mw: float | None
    p10_mw: float | None
    p50_mw: float | None
    p90_mw: float | None
    max_under_forecast_mw: float | None  # largest (actual - forecast)
    max_over_forecast_mw: float | None  # largest (forecast - actual)


def summarise(frame: pd.DataFrame) -> ErrorSummary:
    err = frame["error_mw"]
    if err.empty:
        return ErrorSummary(0, *([None] * 10))
    mean_actual = float(frame["actual_mw"].mean())
    mae = float(err.abs().mean())
    p10, p50, p90 = (float(q) for q in err.quantile(list(QUANTILES)))
    return ErrorSummary(
        n=len(err),
        mae_mw=mae,
        rmse_mw=math.sqrt(float((err**2).mean())),
        bias_mw=float(err.mean()),
        nmae_pct=100 * mae / mean_actual if mean_actual else None,
        mean_actual_mw=mean_actual,
        p10_mw=p10,
        p50_mw=p50,
        p90_mw=p90,
        max_under_forecast_mw=float(err.max()),
        max_over_forecast_mw=float(-err.min()),
    )


def by_hour_of_day(frame: pd.DataFrame) -> pd.DataFrame:
    """Error statistics for each UK local hour of the day (0-23)."""
    hour = frame["start_time"].dt.tz_convert(UK_TZ).dt.hour.rename("hour")
    err = frame["error_mw"]
    grouped = err.groupby(hour)
    out = pd.DataFrame(
        {
            "n": grouped.size(),
            "mae_mw": err.abs().groupby(hour).mean(),
            "bias_mw": grouped.mean(),
            "p10_mw": grouped.quantile(0.1),
            "p90_mw": grouped.quantile(0.9),
        }
    )
    return out.reindex(range(24)).rename_axis("hour").reset_index()


def error_histogram(frame: pd.DataFrame, bin_width_mw: float = 500) -> pd.DataFrame:
    """Counts of errors in fixed-width bins aligned to multiples of bin_width_mw."""
    err = frame["error_mw"]
    if err.empty:
        return pd.DataFrame(columns=["lo_mw", "hi_mw", "count"])
    lo = math.floor(err.min() / bin_width_mw) * bin_width_mw
    hi = (math.floor(err.max() / bin_width_mw) + 1) * bin_width_mw
    edges = np.arange(lo, hi + bin_width_mw / 2, bin_width_mw)
    counts, _ = np.histogram(err, bins=edges)
    return pd.DataFrame({"lo_mw": edges[:-1], "hi_mw": edges[1:], "count": counts})


def by_horizon(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    horizons_h: Iterable[float],
    start: datetime | None = None,
    end: datetime | None = None,
    basis: ActualBasis = ActualBasis.POINT,
) -> pd.DataFrame:
    """Accuracy when using the latest forecast at least h hours old, for each h."""
    rows = []
    for h in horizons_h:
        cmp = build_comparison(forecasts, actuals, SelectionMode.HORIZON, h, start, end, basis)
        s = summarise(cmp.frame)
        rows.append(
            {
                "horizon_h": h,
                "n": s.n,
                "coverage_pct": 100 * s.n / cmp.target_hours if cmp.target_hours else 0.0,
                "mae_mw": s.mae_mw,
                "rmse_mw": s.rmse_mw,
                "bias_mw": s.bias_mw,
                "p10_mw": s.p10_mw,
                "p90_mw": s.p90_mw,
            }
        )
    return pd.DataFrame(rows)


def with_confidence_band(
    frame: pd.DataFrame, summary: ErrorSummary | None = None
) -> pd.DataFrame:
    """Add a P10-P90 band for actual output around each forecast.

    `reliable_mw` (forecast + P10 error) is the wind the client can count on 9
    times in 10, so the shortfall to demand is what must be bought. The band uses
    the error distribution of the same frame, i.e. it is in-sample.
    """
    s = summary or summarise(frame)
    if s.n == 0 or s.p10_mw is None or s.p90_mw is None:
        return frame.assign(reliable_mw=np.nan, upper_mw=np.nan)
    return frame.assign(
        reliable_mw=(frame["forecast_mw"] + s.p10_mw).clip(lower=0),
        upper_mw=(frame["forecast_mw"] + s.p90_mw).clip(lower=0),
    )
