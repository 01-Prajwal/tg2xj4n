import type {
  ByHorizonResponse,
  ByHourResponse,
  Health,
  MetricsResponse,
  QueryEcho,
  SeriesResponse,
  VintagesResponse,
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

export const byHour: ByHourResponse = {
  query,
  hours: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    n: hour < 2 ? 1 : 0,
    mae_mw: hour < 2 ? 2000 : null,
    bias_mw: hour < 2 ? -2000 : null,
    p10_mw: null,
    p90_mw: null,
  })),
}

export const byHorizon: ByHorizonResponse = {
  window,
  basis: 'point',
  horizons: [0, 24, 48].map((h) => ({
    horizon_h: h,
    n: 2,
    coverage_pct: 100,
    mae_mw: 1500 + h * 10,
    rmse_mw: 1800 + h * 10,
    bias_mw: -1500,
    p10_mw: -3000,
    p90_mw: 300,
  })),
}

export const vintages: VintagesResponse = {
  target: '2026-01-02T01:00:00Z',
  actual_mw: 9000,
  day_ahead_cutoff: '2026-01-01T11:00:00Z',
  day_ahead_choice: '2026-01-01T09:30:00Z',
  vintages: [
    {
      publish_time: '2026-01-01T09:30:00Z',
      lead_h: 15.5,
      forecast_mw: 12000,
      before_day_ahead_cutoff: true,
    },
  ],
}
