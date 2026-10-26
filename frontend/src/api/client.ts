import type {
  BacktestResponse,
  ByHorizonResponse,
  DecisionParams,
  DecisionResponse,
  ByHourResponse,
  Filters,
  Health,
  MetricsResponse,
  SeriesResponse,
  VintagesResponse,
} from './types'

// Same-origin by default (Vite proxy in dev, FastAPI/Vercel in prod).
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Params = Record<string, string | number | undefined>

export function buildUrl(path: string, params: Params = {}): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v))
  }
  const query = qs.toString()
  return `${BASE}/api${path}${query ? `?${query}` : ''}`
}

export function filterParams(f: Filters): Params {
  return {
    from: f.from,
    to: f.to,
    mode: f.mode,
    h: f.mode === 'horizon' ? f.horizonH : undefined,
    basis: f.basis,
  }
}

async function get<T>(path: string, params?: Params, signal?: AbortSignal): Promise<T> {
  const res = await fetch(buildUrl(path, params), { signal })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body: unknown = await res.json()
      if (body && typeof body === 'object' && 'detail' in body) {
        detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  return (await res.json()) as T
}

export const api = {
  health: (signal?: AbortSignal) => get<Health>('/health', undefined, signal),
  series: (f: Filters, signal?: AbortSignal) =>
    get<SeriesResponse>('/series', filterParams(f), signal),
  metrics: (f: Filters, signal?: AbortSignal) =>
    get<MetricsResponse>('/metrics', { ...filterParams(f), bin_width: 500 }, signal),
  byHour: (f: Filters, signal?: AbortSignal) =>
    get<ByHourResponse>('/metrics/by-hour', filterParams(f), signal),
  byHorizon: (f: Pick<Filters, 'from' | 'to' | 'basis'>, maxH: number, signal?: AbortSignal) =>
    get<ByHorizonResponse>(
      '/metrics/by-horizon',
      { from: f.from, to: f.to, basis: f.basis, max_h: maxH, step: 1 },
      signal,
    ),
  vintages: (target: string, basis: Filters['basis'], signal?: AbortSignal) =>
    get<VintagesResponse>('/forecast-vintages', { target, basis }, signal),
  decision: (p: DecisionParams, signal?: AbortSignal) =>
    get<DecisionResponse>(
      '/decision',
      {
        decision_time: p.decisionTime,
        confidence: p.confidence,
        lookback_days: p.lookbackDays,
        basis: p.basis,
      },
      signal,
    ),
  backtest: (p: Omit<DecisionParams, 'decisionTime'> & { decisionHour: number }, signal?: AbortSignal) =>
    get<BacktestResponse>(
      '/decision/backtest',
      {
        confidence: p.confidence,
        lookback_days: p.lookbackDays,
        decision_hour: p.decisionHour,
        basis: p.basis,
      },
      signal,
    ),
}
