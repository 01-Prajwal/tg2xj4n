// Mirrors backend/app/schemas.py. Datetimes arrive as ISO-8601 UTC strings.

export type SelectionMode = 'dayahead' | 'horizon'
export type ActualBasis = 'point' | 'hour_mean'

export interface Window {
  start: string
  end: string
}

export interface QueryEcho {
  window: Window
  mode: SelectionMode
  horizon_h: number
  basis: ActualBasis
}

export interface Coverage {
  target_hours: number
  matched_hours: number
  missing_hours: number
}

export interface Health {
  status: string
  snapshot: {
    fetched_at: string
    source: string
    actuals_rows: number
    forecast_rows: number
    forecast_runs: number
  }
  default_window: Window
  max_horizon_h: number
  day_ahead_cutoff_uk: string
}

export interface SeriesPoint {
  start_time: string
  actual_mw: number
  forecast_mw: number
  error_mw: number
  publish_time: string
  lead_h: number
  reliable_mw: number | null
  upper_mw: number | null
}

export interface SeriesResponse {
  query: QueryEcho
  coverage: Coverage
  points: SeriesPoint[]
}

export interface ErrorSummary {
  n: number
  mae_mw: number | null
  rmse_mw: number | null
  bias_mw: number | null
  nmae_pct: number | null
  mean_actual_mw: number | null
  p10_mw: number | null
  p50_mw: number | null
  p90_mw: number | null
  max_under_forecast_mw: number | null
  max_over_forecast_mw: number | null
}

export interface HistogramBin {
  lo_mw: number
  hi_mw: number
  count: number
}

export interface MetricsResponse {
  query: QueryEcho
  coverage: Coverage
  summary: ErrorSummary
  histogram: HistogramBin[]
}

export interface HourStat {
  hour: number
  n: number
  mae_mw: number | null
  bias_mw: number | null
  p10_mw: number | null
  p90_mw: number | null
}

export interface ByHourResponse {
  query: QueryEcho
  hours: HourStat[]
}

export interface HorizonStat {
  horizon_h: number
  n: number
  coverage_pct: number
  mae_mw: number | null
  rmse_mw: number | null
  bias_mw: number | null
  p10_mw: number | null
  p90_mw: number | null
}

export interface ByHorizonResponse {
  window: Window
  basis: ActualBasis
  horizons: HorizonStat[]
}

export interface Vintage {
  publish_time: string
  lead_h: number
  forecast_mw: number
  before_day_ahead_cutoff: boolean
}

export interface VintagesResponse {
  target: string
  actual_mw: number | null
  day_ahead_cutoff: string
  day_ahead_choice: string | null
  vintages: Vintage[]
}

/** The filter state every view is scoped by. */
export interface Filters {
  from: string // ISO UTC, inclusive
  to: string // ISO UTC, exclusive
  mode: SelectionMode
  horizonH: number
  basis: ActualBasis
}
