import { ChartLine, Database, Layers, ShoppingCart, Wind } from 'lucide-react'
import { useState } from 'react'

import type { Filters } from './api/types'
import { Controls } from './components/Controls'
import { DecisionPanel } from './components/DecisionPanel'
import { MainChart } from './components/MainChart'
import { Headline, StatTiles } from './components/Summary'
import { useHealth, useMetrics, useSeries } from './hooks/useApi'
import { fmtDateTime } from './lib/format'
import { defaultFilters } from './lib/selection'

type View = 'plan' | 'accuracy'

const VIEWS: { id: View; num: number; label: string; icon: typeof Wind }[] = [
  { id: 'plan', num: 1, label: 'Plan tomorrow', icon: ShoppingCart },
  { id: 'accuracy', num: 2, label: 'Forecast accuracy', icon: ChartLine },
]

function initialView(): View {
  return typeof window !== 'undefined' && window.location.hash === '#accuracy'
    ? 'accuracy'
    : 'plan'
}

export default function App() {
  const health = useHealth()
  const [view, setViewState] = useState<View>(initialView)
  // User choices; until the user changes something, defaults come from the server.
  const [chosenFilters, setFilters] = useState<Filters | null>(null)
  const filters = chosenFilters ?? (health.data ? defaultFilters(health.data) : null)

  const setView = (v: View) => {
    setViewState(v)
    window.history.replaceState(null, '', v === 'plan' ? ' ' : `#${v}`)
  }

  const series = useSeries(filters)
  const metrics = useMetrics(filters)

  const snapshot = health.data?.snapshot
  const hero = (
    <header className="hero">
      <div className="hero-inner">
        <div className="brand">
          <span className="brand-mark">
            <span className="brand-logo" aria-hidden>
              <Wind size={18} />
            </span>
            Wind Forecast Monitor
          </span>
          <span className="pilot-badge">Day-ahead desk · Pilot</span>
        </div>
        <div>
          <h1 className="hero-title">Buy tomorrow&apos;s power knowing what the wind will do</h1>
          <p className="hero-sub">
            The latest national wind forecast available when you buy on the day-ahead market, and
            a measured view of how far to trust it. Decisions made in January 2026.
          </p>
        </div>
        <div className="chips">
          <span className="chip">
            <Database size={14} aria-hidden /> Elexon BMRS · FUELHH &amp; WINDFOR
          </span>
          {snapshot && (
            <>
              <span className="chip">
                <Layers size={14} aria-hidden /> {snapshot.forecast_runs} forecast runs
              </span>
              <span className="chip">Snapshot {fmtDateTime(snapshot.fetched_at)}</span>
            </>
          )}
        </div>
        <div className="view-tabs" role="tablist" aria-label="Views">
          {VIEWS.map(({ id, num, label, icon: Icon }) => (
            <button
              key={id}
              id={`view-${id}`}
              role="tab"
              className="view-tab"
              aria-selected={view === id}
              aria-controls={`panel-view-${id}`}
              onClick={() => setView(id)}
            >
              <span className="view-tab-num">{num}</span>
              <Icon size={16} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>
    </header>
  )

  if (health.isError) {
    return (
      <>
        {hero}
        <main className="app">
          <div className="notice error" role="alert">
            <strong>The data service is unavailable.</strong>
            <p className="hint">{health.error.message}</p>
          </div>
        </main>
      </>
    )
  }
  if (!health.data || !filters) {
    return (
      <>
        {hero}
        <main className="app">
          <div className="notice">
            <p className="hint">Loading…</p>
          </div>
        </main>
      </>
    )
  }

  const dataError = series.error ?? metrics.error
  return (
    <>
      {hero}
      <main className="app">
        {/* Both panels stay mounted so each keeps its settings when switching views. */}
        <div
          id="panel-view-plan"
          role="tabpanel"
          aria-labelledby="view-plan"
          hidden={view !== 'plan'}
          className="section"
        >
          <div className="section-intro">
            <div>
              <h2>Plan tomorrow&apos;s purchase</h2>
              <p>
                What the desk sees at decision time: the latest wind forecast for the next day,
                and how much of it to rely on, based only on forecast errors already known then.
              </p>
            </div>
          </div>
          <DecisionPanel basis={filters.basis} />
        </div>

        <div
          id="panel-view-accuracy"
          role="tabpanel"
          aria-labelledby="view-accuracy"
          hidden={view !== 'accuracy'}
          className="section"
        >
          <div className="section-intro">
            <div>
              <h2>How accurate are the forecasts?</h2>
              <p>
                The day-ahead forecast scored against actual output, hour by hour, across the
                whole month.
              </p>
            </div>
          </div>

          <Controls
            filters={filters}
            defaultWindow={health.data.default_window}
            onChange={setFilters}
          />

          {dataError && (
            <div className="notice error" role="alert">
              <strong>Could not load this selection.</strong>
              <p className="hint">{dataError.message}</p>
            </div>
          )}

          {metrics.data && <Headline data={metrics.data} loading={metrics.isFetching} />}
          {metrics.data && <StatTiles data={metrics.data} loading={metrics.isFetching} />}

          {series.data && <MainChart data={series.data} loading={series.isFetching} />}
        </div>

        <footer className="footer">
          <span>
            Error = actual − forecast. Plan bands use only errors known at decision time; accuracy
            bands use the selected period&apos;s own errors (in-sample).
          </span>
          <span>
            Contains BMRS data © Elexon Limited copyright and database right 2026.
          </span>
        </footer>
      </main>
    </>
  )
}
