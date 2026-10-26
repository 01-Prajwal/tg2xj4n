"""The trader's view at the moment of a day-ahead decision.

Given a decision time on day D-1, this answers:

1. What is the latest forecast for delivery day D available right now? (the most
   recent WINDFOR run published at or before the decision time)
2. How wrong is it likely to be? Error quantiles come only from hours whose actual
   output was already known at decision time, over a trailing window, using the
   same day-ahead forecast rule. Nothing from the future leaks in.
3. What does that mean for the purchase? At a chosen confidence level, the wind
   the desk can count on and the extra cover needed beyond the forecast, in MWh.

`backtest` replays that rule for every decision day to check that the bands are
honest: at 90% confidence, actual wind should land above the "count on" line in
roughly 90% of hours.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

import pandas as pd

from app.config import UK_TZ
from app.services.selection import ActualBasis, SelectionMode, build_comparison, hourly_actuals

HALF_HOUR = pd.Timedelta(minutes=30)


@dataclass(frozen=True)
class ErrorModel:
    """Error quantiles (actual - forecast, MW) learned from the lookback window."""

    n: int
    window_start: pd.Timestamp
    window_end: pd.Timestamp
    confidence: float
    low_mw: float | None  # quantile at 1 - confidence
    median_mw: float | None
    high_mw: float | None  # quantile at confidence
    bias_mw: float | None
    mae_mw: float | None


@dataclass(frozen=True)
class DecisionView:
    decision_time: pd.Timestamp
    delivery_day: date
    delivery_start: pd.Timestamp
    delivery_end: pd.Timestamp
    run_publish_time: pd.Timestamp | None
    next_run_publish_time: pd.Timestamp | None
    hours: pd.DataFrame  # start_time, forecast_mw, lead_h, low_mw, median_mw, high_mw, actual_mw
    runs: pd.DataFrame  # publish_time, mean_forecast_mw, hours_covered
    model: ErrorModel
    expected_hours: int


def delivery_window(decision_time: pd.Timestamp) -> tuple[date, pd.Timestamp, pd.Timestamp]:
    """Delivery day D (the UK day after the decision) and its [start, end) in UTC."""
    local_day = decision_time.tz_convert(UK_TZ).date()
    d = local_day + timedelta(days=1)
    start = pd.Timestamp(d).tz_localize(UK_TZ).tz_convert("UTC")
    end = pd.Timestamp(d + timedelta(days=1)).tz_localize(UK_TZ).tz_convert("UTC")
    return d, start, end


def error_model(
    history: pd.DataFrame,
    decision_time: pd.Timestamp,
    lookback_days: int,
    confidence: float,
) -> ErrorModel:
    """Quantiles of day-ahead errors for hours fully observed before decision_time.

    `history` is a day-ahead Comparison frame covering at least the lookback window.
    """
    window_start = decision_time - pd.Timedelta(days=lookback_days)
    # An hour's actual (the half-hour starting on the hour) is known 30 min later.
    known = history[
        (history["start_time"] >= window_start)
        & (history["start_time"] + HALF_HOUR <= decision_time)
    ]
    err = known["error_mw"]
    if err.empty:
        return ErrorModel(0, window_start, decision_time, confidence, *([None] * 5))
    lo, mid, hi = (float(q) for q in err.quantile([1 - confidence, 0.5, confidence]))
    return ErrorModel(
        n=len(err),
        window_start=window_start,
        window_end=decision_time,
        confidence=confidence,
        low_mw=lo,
        median_mw=mid,
        high_mw=hi,
        bias_mw=float(err.mean()),
        mae_mw=float(err.abs().mean()),
    )


def day_ahead_history(
    forecasts: pd.DataFrame, actuals: pd.DataFrame, basis: ActualBasis
) -> pd.DataFrame:
    """Day-ahead forecast/actual pairs for every hour in the snapshot."""
    return build_comparison(forecasts, actuals, SelectionMode.DAY_AHEAD, basis=basis).frame


def decision_view(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    decision_time: datetime,
    confidence: float = 0.9,
    lookback_days: int = 30,
    basis: ActualBasis = ActualBasis.POINT,
    history: pd.DataFrame | None = None,
) -> DecisionView:
    t = pd.Timestamp(decision_time)
    day, start, end = delivery_window(t)

    published = forecasts[forecasts["publish_time"] <= t]
    run_time = published["publish_time"].max() if not published.empty else None
    later = forecasts.loc[forecasts["publish_time"] > t, "publish_time"]
    next_run = later.min() if not later.empty else None

    in_day = forecasts[(forecasts["start_time"] >= start) & (forecasts["start_time"] < end)]
    runs = (
        in_day[in_day["publish_time"] <= t]
        .groupby("publish_time")["generation_mw"]
        .agg(mean_forecast_mw="mean", hours_covered="size")
        .reset_index()
        .sort_values("publish_time")
    )

    hist = history if history is not None else day_ahead_history(forecasts, actuals, basis)
    model = error_model(hist, t, lookback_days, confidence)

    latest = in_day[in_day["publish_time"] == run_time]
    hours = latest[["start_time", "generation_mw"]].rename(columns={"generation_mw": "forecast_mw"})
    if run_time is None:  # no run published yet: nothing to show
        hours = hours.assign(lead_h=pd.Series(dtype="float64"))
    else:
        lead: pd.Series = hours["start_time"] - run_time
        hours = hours.assign(lead_h=lead.dt.total_seconds() / 3600)
    hours = _apply_band(hours, model)

    actual = hourly_actuals(actuals, basis)
    hours = hours.merge(
        actual.rename_axis("start_time").reset_index(), on="start_time", how="left"
    ).sort_values("start_time")

    expected = int((end - start) / pd.Timedelta(hours=1))
    return DecisionView(
        decision_time=t,
        delivery_day=day,
        delivery_start=start,
        delivery_end=end,
        run_publish_time=run_time,
        next_run_publish_time=next_run,
        hours=hours.reset_index(drop=True),
        runs=runs.reset_index(drop=True),
        model=model,
        expected_hours=expected,
    )


def _apply_band(hours: pd.DataFrame, model: ErrorModel) -> pd.DataFrame:
    if model.low_mw is None or model.median_mw is None or model.high_mw is None:
        return hours.assign(low_mw=float("nan"), median_mw=float("nan"), high_mw=float("nan"))
    f = hours["forecast_mw"]
    return hours.assign(
        low_mw=(f + model.low_mw).clip(lower=0),
        median_mw=(f + model.median_mw).clip(lower=0),
        high_mw=(f + model.high_mw).clip(lower=0),
    )


@dataclass(frozen=True)
class EnergyTotals:
    """Delivery-day totals in MWh (hourly MW summed over 1 h steps)."""

    forecast_mwh: float
    count_on_mwh: float | None
    expected_mwh: float | None
    extra_cover_mwh: float | None  # forecast - count_on: cover to buy at this confidence
    actual_mwh: float | None  # hindsight, only when every hour has an actual
    hours_below_count_on: int | None


def energy_totals(hours: pd.DataFrame) -> EnergyTotals:
    forecast = float(hours["forecast_mw"].sum())
    has_band = bool(hours["low_mw"].notna().all()) and not hours.empty
    count_on = float(hours["low_mw"].sum()) if has_band else None
    expected = float(hours["median_mw"].sum()) if has_band else None
    has_actual = bool(hours["actual_mw"].notna().all()) and not hours.empty
    return EnergyTotals(
        forecast_mwh=forecast,
        count_on_mwh=count_on,
        expected_mwh=expected,
        extra_cover_mwh=forecast - count_on if count_on is not None else None,
        actual_mwh=float(hours["actual_mw"].sum()) if has_actual else None,
        hours_below_count_on=(
            int((hours["actual_mw"] < hours["low_mw"]).sum()) if has_actual and has_band else None
        ),
    )


def backtest(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    decision_days: list[date],
    decision_hour: int,
    confidence: float,
    lookback_days: int,
    basis: ActualBasis = ActualBasis.POINT,
) -> pd.DataFrame:
    """Replay the decision rule for each day; one row per decision day."""
    history = day_ahead_history(forecasts, actuals, basis)
    rows = []
    for d in decision_days:
        t = pd.Timestamp(datetime(d.year, d.month, d.day, decision_hour)).tz_localize(UK_TZ)
        view = decision_view(
            forecasts, actuals, t.tz_convert("UTC"), confidence, lookback_days, basis, history
        )
        totals = energy_totals(view.hours)
        scored = view.hours.dropna(subset=["actual_mw", "low_mw"])
        rows.append(
            {
                "decision_day": d,
                "delivery_day": view.delivery_day,
                "hours": len(scored),
                "hours_above_count_on": int((scored["actual_mw"] >= scored["low_mw"]).sum()),
                "forecast_mwh": totals.forecast_mwh,
                "count_on_mwh": totals.count_on_mwh,
                "actual_mwh": totals.actual_mwh,
                "extra_cover_mwh": totals.extra_cover_mwh,
            }
        )
    return pd.DataFrame(rows)
