import { useMemo, useState } from 'react'

import type { Filters } from './api/types'
import { AnalysisTabs } from './components/AnalysisTabs'
import { Controls } from './components/Controls'
import { DecisionPanel } from './components/DecisionPanel'
import { MainChart } from './components/MainChart'
import { Headline, StatTiles } from './components/Summary'
import { VintagesPanel } from './components/VintagesPanel'
import {
  useByHorizon,
  useByHour,
  useHealth,
  useMetrics,
  useSeries,
  useVintages,
} from './hooks/useApi'
import { fmtDateTime } from './lib/format'
import { SLIDER_MAX_H, defaultFilters, worstHour } from './lib/selection'

export default function App() {
  const health = useHealth()
  // User choices; until the user changes something, defaults come from the server.
  const [chosenFilters, setFilters] = useState<Filters | null>(null)
  const [pickedTarget, setTarget] = useState<string | null>(null)
  const filters = chosenFilters ?? (health.data ? defaultFilters(health.data) : null)

  const series = useSeries(filters)
  const metrics = useMetrics(filters)
  const byHour = useByHour(filters)
  const byHorizon = useByHorizon(filters, SLIDER_MAX_H)

  // Drill into the clicked hour if it is in the visible slice, else the worst miss.
  const points = series.data?.points
  const target = useMemo(() => {
    if (!points) return null
    return pickedTarget && points.some((p) => p.start_time === pickedTarget)
      ? pickedTarget
      : worstHour(points)
  }, [points, pickedTarget])
  const vintages = useVintages(target, filters?.basis ?? 'point')

  if (health.isError) {
    return (
      <main className="app">
        <div className="notice error" role="alert">
          <strong>The data service is unavailable.</strong>
          <p className="hint">{health.error.message}</p>
        </div>
      </main>
    )
  }
  if (!health.data || !filters) {
    return (
      <main className="app">
        <p className="hint">Loading…</p>
      </main>
    )
  }

  const dataError = series.error ?? metrics.error
  return (
    <main className="app">
      <header className="header">
        <div>
          <div className="eyebrow">Day-ahead trading · Pilot</div>
          <h1>UK Wind Forecast Monitor</h1>
          <p className="subtitle">
            For day-ahead purchase decisions made in January 2026: the latest national wind
            forecast available when you buy, and how far to trust it.
          </p>
        </div>
        <div className="meta">
          Elexon BMRS · FUELHH (actual) &amp; WINDFOR (forecast)
          <br />
          Snapshot {fmtDateTime(health.data.snapshot.fetched_at)} ·{' '}
          {health.data.snapshot.forecast_runs} forecast runs
        </div>
      </header>

      <DecisionPanel basis={filters.basis} />

      <div className="section-head">
        <span className="section-num">2</span>
        <div>
          <h2>How accurate are the forecasts?</h2>
          <p className="card-sub">
            The day-ahead forecast scored against actual output, hour by hour, across the whole
            month.
          </p>
        </div>
      </div>

      <Controls filters={filters} defaultWindow={health.data.default_window} onChange={setFilters} />

      {dataError && (
        <div className="notice error" role="alert">
          <strong>Could not load this selection.</strong>
          <p className="hint">{dataError.message}</p>
        </div>
      )}

      {metrics.data && <Headline data={metrics.data} loading={metrics.isFetching} />}
      {metrics.data && <StatTiles data={metrics.data} loading={metrics.isFetching} />}

      {series.data && (
        <MainChart
          data={series.data}
          loading={series.isFetching}
          selected={target}
          onSelect={setTarget}
        />
      )}

      {metrics.data && (
        <div className="grid-2">
          <AnalysisTabs
            metrics={metrics.data}
            byHour={byHour.data}
            byHorizon={byHorizon.data}
            loading={metrics.isFetching || byHour.isFetching || byHorizon.isFetching}
          />
          <VintagesPanel
            data={vintages.data}
            loading={vintages.isFetching}
            error={vintages.error}
          />
        </div>
      )}

      <footer className="footer">
        <span>
          Error = actual − forecast. Section 1 bands use only errors known at decision time;
          section 2 bands use the selected period&apos;s own errors (in-sample).
        </span>
        <span>
          Contains BMRS data © Elexon Limited copyright and database right 2026.
        </span>
      </footer>
    </main>
  )
}
