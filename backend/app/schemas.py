"""API response models. These define the JSON contract the frontend relies on."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.services.selection import ActualBasis, SelectionMode


class Window(BaseModel):
    start: datetime = Field(description="First target hour (inclusive, UTC)")
    end: datetime = Field(description="End of window (exclusive, UTC)")


class QueryEcho(BaseModel):
    """The resolved query, so the client can show exactly what was computed."""

    window: Window
    mode: SelectionMode
    horizon_h: float
    basis: ActualBasis


class Coverage(BaseModel):
    target_hours: int
    matched_hours: int
    missing_hours: int


class SnapshotInfo(BaseModel):
    fetched_at: str
    source: str
    actuals_rows: int
    forecast_rows: int
    forecast_runs: int


class Health(BaseModel):
    status: str
    snapshot: SnapshotInfo
    default_window: Window
    max_horizon_h: int
    day_ahead_cutoff_uk: str


class SeriesPoint(BaseModel):
    start_time: datetime
    actual_mw: float
    forecast_mw: float
    error_mw: float = Field(description="actual - forecast")
    publish_time: datetime = Field(description="When the chosen forecast was published")
    lead_h: float
    reliable_mw: float | None = Field(description="forecast + P10 error: wind to count on")
    upper_mw: float | None = Field(description="forecast + P90 error")


class SeriesResponse(BaseModel):
    query: QueryEcho
    coverage: Coverage
    points: list[SeriesPoint]


class ErrorSummary(BaseModel):
    n: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    nmae_pct: float | None
    mean_actual_mw: float | None
    p10_mw: float | None
    p50_mw: float | None
    p90_mw: float | None
    max_under_forecast_mw: float | None
    max_over_forecast_mw: float | None


class HistogramBin(BaseModel):
    lo_mw: float
    hi_mw: float
    count: int


class MetricsResponse(BaseModel):
    query: QueryEcho
    coverage: Coverage
    summary: ErrorSummary
    histogram: list[HistogramBin]


class HourStat(BaseModel):
    hour: int = Field(description="UK local hour of day, 0-23")
    n: int
    mae_mw: float | None
    bias_mw: float | None
    p10_mw: float | None
    p90_mw: float | None


class ByHourResponse(BaseModel):
    query: QueryEcho
    hours: list[HourStat]


class HorizonStat(BaseModel):
    horizon_h: float
    n: int
    coverage_pct: float
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    p10_mw: float | None
    p90_mw: float | None


class ByHorizonResponse(BaseModel):
    window: Window
    basis: ActualBasis
    horizons: list[HorizonStat]


class Vintage(BaseModel):
    publish_time: datetime
    lead_h: float
    forecast_mw: float
    before_day_ahead_cutoff: bool


class VintagesResponse(BaseModel):
    target: datetime
    actual_mw: float | None
    day_ahead_cutoff: datetime
    day_ahead_choice: datetime | None = Field(
        description="publish_time of the forecast the day-ahead rule selects"
    )
    vintages: list[Vintage]
