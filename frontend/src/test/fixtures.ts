import type {
  Health,
  MetricsResponse,
  QueryEcho,
  SeriesResponse,
} from '../api/types'

const window = { start: '2026-01-02T00:00:00Z', end: '2026-02-02T00:00:00Z' }
const query: QueryEcho = { window, mode: 'dayahead', horizon_h: 0, basis: 'point' }
const coverage = { target_hours: 2, matched_hours: 2, missing_hours: 0 }

export const health: Health = {
  status: 'ok',
  snapshot: {
    fetched_at: '2026-10-26T05:55:08+00:00',
    source: 'test',
    actuals_rows: 4,
    forecast_rows: 2,
    forecast_runs: 1,
  },
  default_window: window,
  max_horizon_h: 72,
  day_ahead_cutoff_uk: '11:00 on D-1',
}

export const series: SeriesResponse = {
  query,
  coverage,
  points: [
    {
      start_time: '2026-01-02T00:00:00Z',
      actual_mw: 10000,
      forecast_mw: 11000,
      error_mw: -1000,
      publish_time: '2026-01-01T09:30:00Z',
      lead_h: 14.5,
      reliable_mw: 8000,
      upper_mw: 11500,
    },
    {
      start_time: '2026-01-02T01:00:00Z',
      actual_mw: 9000,
      forecast_mw: 12000,
      error_mw: -3000,
      publish_time: '2026-01-01T09:30:00Z',
      lead_h: 15.5,
      reliable_mw: 9000,
      upper_mw: 12500,
    },
  ],
}

export const metrics: MetricsResponse = {
  query,
  coverage,
  summary: {
    n: 2,
    mae_mw: 2000,
    rmse_mw: 2236,
    bias_mw: -2000,
    nmae_pct: 21.1,
    mean_actual_mw: 9500,
    p10_mw: -2800,
    p50_mw: -2000,
    p90_mw: -1200,
    max_under_forecast_mw: -1000,
    max_over_forecast_mw: 3000,
  },
  histogram: [
    { lo_mw: -3000, hi_mw: -2500, count: 1 },
    { lo_mw: -2500, hi_mw: -2000, count: 0 },
    { lo_mw: -1500, hi_mw: -1000, count: 1 },
  ],
}

export const decision: import('../api/types').DecisionResponse = {
  decision_time: '2026-01-31T11:00:00Z',
  delivery_day: '2026-02-01',
  delivery_start: '2026-02-01T00:00:00Z',
  delivery_end: '2026-02-02T00:00:00Z',
  run_publish_time: '2026-01-31T09:30:00Z',
  next_run_publish_time: '2026-01-31T11:30:00Z',
  expected_hours: 2,
  hours: [
    {
      start_time: '2026-02-01T00:00:00Z',
      forecast_mw: 10000,
      lead_h: 14.5,
      low_mw: 6000,
      median_mw: 9000,
      high_mw: 11000,
      actual_mw: 7000,
    },
    {
      start_time: '2026-02-01T01:00:00Z',
      forecast_mw: 12000,
      lead_h: 15.5,
      low_mw: 8000,
      median_mw: 11000,
      high_mw: 13000,
      actual_mw: 7500,
    },
  ],
  runs: [
    { publish_time: '2026-01-31T07:30:00Z', mean_forecast_mw: 10500, hours_covered: 2 },
    { publish_time: '2026-01-31T09:30:00Z', mean_forecast_mw: 11000, hours_covered: 2 },
  ],
  error_model: {
    n: 720,
    window_start: '2026-01-01T11:00:00Z',
    window_end: '2026-01-31T11:00:00Z',
    confidence: 0.9,
    low_mw: -4000,
    median_mw: -1000,
    high_mw: 1000,
    bias_mw: -1300,
    mae_mw: 1900,
  },
  totals: {
    forecast_mwh: 22000,
    count_on_mwh: 14000,
    expected_mwh: 20000,
    extra_cover_mwh: 8000,
    actual_mwh: 14500,
    hours_below_count_on: 1,
  },
}

export const backtest: import('../api/types').BacktestResponse = {
  confidence: 0.9,
  lookback_days: 30,
  decision_hour_uk: 11,
  hours: 744,
  hit_rate_pct: 89.4,
  mean_extra_cover_mwh: 99900,
  days: [],
}
