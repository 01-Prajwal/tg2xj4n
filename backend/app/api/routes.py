"""HTTP layer: parse and validate query parameters, call services, shape responses.

No analysis logic lives here; see app.services.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query

from app import schemas
from app.config import (
    DAY_AHEAD_CUTOFF_HOUR,
    DECISION_FIRST_DAY,
    DECISION_LAST_DAY,
    DELIVERY_END_UTC,
    DELIVERY_START_UTC,
    MAX_HORIZON_HOURS,
    MAX_LOOKBACK_DAYS,
    UK_TZ,
)
from app.data.repository import get_snapshot
from app.data.snapshot import Snapshot
from app.services import decision, metrics
from app.services.selection import (
    ActualBasis,
    Comparison,
    SelectionMode,
    build_comparison,
    day_ahead_cutoff,
    hourly_actuals,
    select_forecasts,
)

router = APIRouter(prefix="/api")

SnapshotDep = Annotated[Snapshot, Depends(get_snapshot)]


@dataclass(frozen=True)
class WindowParams:
    start: datetime
    end: datetime

    def echo(self) -> schemas.Window:
        return schemas.Window(start=self.start, end=self.end)


@dataclass(frozen=True)
class ComparisonParams:
    window: WindowParams
    mode: SelectionMode
    horizon_h: float
    basis: ActualBasis

    def echo(self) -> schemas.QueryEcho:
        return schemas.QueryEcho(
            window=self.window.echo(), mode=self.mode, horizon_h=self.horizon_h, basis=self.basis
        )

    def run(self, snapshot: Snapshot) -> Comparison:
        return build_comparison(
            snapshot.forecasts,
            snapshot.actuals,
            self.mode,
            self.horizon_h,
            self.window.start,
            self.window.end,
            self.basis,
        )


def _utc(dt: datetime) -> datetime:
    """Treat naive datetimes as UTC; convert aware ones to UTC."""
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)


def window_params(
    start: Annotated[
        datetime | None, Query(alias="from", description="First target hour (UTC, inclusive)")
    ] = None,
    end: Annotated[datetime | None, Query(alias="to", description="End (UTC, exclusive)")] = None,
) -> WindowParams:
    s = _utc(start) if start else DELIVERY_START_UTC
    e = _utc(end) if end else DELIVERY_END_UTC
    if s >= e:
        raise HTTPException(status_code=422, detail="'from' must be before 'to'")
    return WindowParams(s, e)


def comparison_params(
    window: Annotated[WindowParams, Depends(window_params)],
    mode: SelectionMode = SelectionMode.DAY_AHEAD,
    h: Annotated[
        float,
        Query(ge=0, le=MAX_HORIZON_HOURS, description="Minimum lead time (horizon mode only)"),
    ] = 0,
    basis: ActualBasis = ActualBasis.POINT,
) -> ComparisonParams:
    return ComparisonParams(window, mode, h if mode is SelectionMode.HORIZON else 0, basis)


ComparisonDep = Annotated[ComparisonParams, Depends(comparison_params)]


def _records(df: pd.DataFrame) -> list[dict[str, Any]]:
    """DataFrame rows as dicts with NaN replaced by None (JSON null)."""
    clean = df.astype(object).where(df.notna(), None)
    return [{str(k): v for k, v in row.items()} for row in clean.to_dict("records")]


def _coverage(cmp: Comparison) -> schemas.Coverage:
    return schemas.Coverage(
        target_hours=cmp.target_hours,
        matched_hours=cmp.matched_hours,
        missing_hours=cmp.missing_hours,
    )


@router.get("/health", response_model=schemas.Health)
def health(snapshot: SnapshotDep) -> schemas.Health:
    meta = snapshot.meta
    return schemas.Health(
        status="ok",
        snapshot=schemas.SnapshotInfo(
            fetched_at=meta.fetched_at,
            source=meta.source,
            actuals_rows=meta.actuals_rows,
            forecast_rows=meta.forecast_rows,
            forecast_runs=meta.forecast_runs,
        ),
        default_window=schemas.Window(start=DELIVERY_START_UTC, end=DELIVERY_END_UTC),
        max_horizon_h=MAX_HORIZON_HOURS,
        day_ahead_cutoff_uk=f"{DAY_AHEAD_CUTOFF_HOUR:02d}:00 on D-1",
    )


@router.get("/series", response_model=schemas.SeriesResponse)
def series(snapshot: SnapshotDep, params: ComparisonDep) -> schemas.SeriesResponse:
    """Hourly actual vs selected forecast, with the P10-P90 band around each forecast."""
    cmp = params.run(snapshot)
    frame = metrics.with_confidence_band(cmp.frame)
    return schemas.SeriesResponse(
        query=params.echo(),
        coverage=_coverage(cmp),
        points=[schemas.SeriesPoint(**r) for r in _records(frame)],
    )


@router.get("/metrics", response_model=schemas.MetricsResponse)
def summary_metrics(
    snapshot: SnapshotDep,
    params: ComparisonDep,
    bin_width: Annotated[float, Query(gt=0, le=10_000, description="Histogram bin, MW")] = 500,
) -> schemas.MetricsResponse:
    cmp = params.run(snapshot)
    s = metrics.summarise(cmp.frame)
    hist = metrics.error_histogram(cmp.frame, bin_width)
    return schemas.MetricsResponse(
        query=params.echo(),
        coverage=_coverage(cmp),
        summary=schemas.ErrorSummary(**vars(s)),
        histogram=[schemas.HistogramBin(**r) for r in _records(hist)],
    )


@router.get("/metrics/by-hour", response_model=schemas.ByHourResponse)
def metrics_by_hour(snapshot: SnapshotDep, params: ComparisonDep) -> schemas.ByHourResponse:
    """Error statistics for each UK local hour of the day."""
    table = metrics.by_hour_of_day(params.run(snapshot).frame)
    table["n"] = table["n"].fillna(0).astype(int)
    return schemas.ByHourResponse(
        query=params.echo(), hours=[schemas.HourStat(**r) for r in _records(table)]
    )


@router.get("/metrics/by-horizon", response_model=schemas.ByHorizonResponse)
def metrics_by_horizon(
    snapshot: SnapshotDep,
    window: Annotated[WindowParams, Depends(window_params)],
    basis: ActualBasis = ActualBasis.POINT,
    max_h: Annotated[float, Query(ge=0, le=MAX_HORIZON_HOURS)] = 48,
    step: Annotated[float, Query(ge=0.5, le=24)] = 1,
) -> schemas.ByHorizonResponse:
    """Accuracy using the latest forecast at least h hours old, for h = 0, step, ..., max_h."""
    horizons = np.arange(0, max_h + step / 2, step).tolist()
    table = metrics.by_horizon(
        snapshot.forecasts, snapshot.actuals, horizons, window.start, window.end, basis
    )
    return schemas.ByHorizonResponse(
        window=window.echo(),
        basis=basis,
        horizons=[schemas.HorizonStat(**r) for r in _records(table)],
    )


@router.get("/forecast-vintages", response_model=schemas.VintagesResponse)
def forecast_vintages(
    snapshot: SnapshotDep,
    target: Annotated[datetime, Query(description="Target hour (UTC)")],
    basis: ActualBasis = ActualBasis.POINT,
) -> schemas.VintagesResponse:
    """Every forecast issued ahead of one target hour: how the prediction evolved."""
    t = pd.Timestamp(_utc(target))
    f = snapshot.forecasts
    runs = f[(f["start_time"] == t) & (f["publish_time"] <= t)].sort_values("publish_time")
    actual = hourly_actuals(snapshot.actuals, basis)
    actual_mw = float(actual[t]) if t in actual.index else None
    if runs.empty and actual_mw is None:
        raise HTTPException(status_code=404, detail=f"No data for target hour {t.isoformat()}")

    cutoff = day_ahead_cutoff(pd.Series([t])).iloc[0]
    choice = select_forecasts(runs, SelectionMode.DAY_AHEAD)
    table = pd.DataFrame(
        {
            "publish_time": runs["publish_time"],
            "lead_h": (t - runs["publish_time"]).dt.total_seconds() / 3600,
            "forecast_mw": runs["generation_mw"],
            "before_day_ahead_cutoff": runs["publish_time"] <= cutoff,
        }
    )
    return schemas.VintagesResponse(
        target=t,
        actual_mw=actual_mw,
        day_ahead_cutoff=cutoff,
        day_ahead_choice=choice["publish_time"].iloc[0] if not choice.empty else None,
        vintages=[schemas.Vintage(**r) for r in _records(table)],
    )


# --- Decision support -----------------------------------------------------------

ConfidenceQ = Annotated[
    float, Query(ge=0.5, le=0.99, description="Probability that actual wind is >= count-on line")
]
LookbackQ = Annotated[
    int, Query(ge=3, le=MAX_LOOKBACK_DAYS, description="Days of known errors to calibrate on")
]


def _default_decision_time() -> datetime:
    local = pd.Timestamp(datetime.combine(DECISION_LAST_DAY, datetime.min.time()))
    local = local.replace(hour=DAY_AHEAD_CUTOFF_HOUR).tz_localize(UK_TZ)
    return local.tz_convert("UTC").to_pydatetime()


@router.get("/decision", response_model=schemas.DecisionResponse)
def decision_support(
    snapshot: SnapshotDep,
    decision_time: Annotated[
        datetime | None,
        Query(description="When the purchase decision is made (UTC). Default: 31 Jan 11:00"),
    ] = None,
    confidence: ConfidenceQ = 0.9,
    lookback_days: LookbackQ = 30,
    basis: ActualBasis = ActualBasis.POINT,
) -> schemas.DecisionResponse:
    """What the desk sees at decision time: latest forecast for tomorrow, plus error bands."""
    t = _utc(decision_time) if decision_time else _default_decision_time()
    uk_day = pd.Timestamp(t).tz_convert(UK_TZ).date()
    if not DECISION_FIRST_DAY <= uk_day <= DECISION_LAST_DAY:
        raise HTTPException(
            status_code=422,
            detail=f"decision_time must fall on a UK day between {DECISION_FIRST_DAY} "
            f"and {DECISION_LAST_DAY}",
        )
    view = decision.decision_view(
        snapshot.forecasts, snapshot.actuals, t, confidence, lookback_days, basis
    )
    m = view.model
    return schemas.DecisionResponse(
        decision_time=view.decision_time,
        delivery_day=view.delivery_day,
        delivery_start=view.delivery_start,
        delivery_end=view.delivery_end,
        run_publish_time=view.run_publish_time,
        next_run_publish_time=view.next_run_publish_time,
        expected_hours=view.expected_hours,
        hours=[schemas.DecisionHour(**r) for r in _records(view.hours)],
        runs=[schemas.DecisionRun(**r) for r in _records(view.runs)],
        error_model=schemas.ErrorModel(**vars(m)),
        totals=schemas.EnergyTotals(**vars(decision.energy_totals(view.hours))),
    )


@router.get("/decision/backtest", response_model=schemas.BacktestResponse)
def decision_backtest(
    snapshot: SnapshotDep,
    confidence: ConfidenceQ = 0.9,
    lookback_days: LookbackQ = 30,
    decision_hour: Annotated[int, Query(ge=0, le=23, description="UK hour of decision")] = 11,
    basis: ActualBasis = ActualBasis.POINT,
) -> schemas.BacktestResponse:
    """Replay the decision rule on every January decision day and score the bands."""
    days = pd.date_range(DECISION_FIRST_DAY, DECISION_LAST_DAY, freq="D").date.tolist()
    table = decision.backtest(
        snapshot.forecasts, snapshot.actuals, days, decision_hour, confidence, lookback_days, basis
    )
    hours = int(table["hours"].sum())
    return schemas.BacktestResponse(
        confidence=confidence,
        lookback_days=lookback_days,
        decision_hour_uk=decision_hour,
        hours=hours,
        hit_rate_pct=100 * table["hours_above_count_on"].sum() / hours if hours else None,
        mean_extra_cover_mwh=(
            float(cover.mean()) if (cover := table["extra_cover_mwh"]).notna().any() else None
        ),
        days=[schemas.BacktestDay(**r) for r in _records(table)],
    )
