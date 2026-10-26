import type { MetricsResponse, QueryEcho } from '../api/types'
import { dateToIso, addDays, fmtDay, fmtGW, fmtPct, fmtSignedGW, isoToDate } from '../lib/format'

// Described from the response's own query echo, so text and numbers always agree
// (even while a newer request is still loading).
function describeForecast(q: QueryEcho): string {
  return q.mode === 'dayahead'
    ? 'the forecast available at the 11:00 day-ahead cutoff'
    : `the latest forecast published at least ${q.horizon_h} h ahead`
}

function periodLabel(q: QueryEcho): string {
  const last = addDays(isoToDate(q.window.end), -1)
  return `${fmtDay(q.window.start)} – ${fmtDay(dateToIso(last))}`
}

/** One-sentence takeaway for the selected slice. */
export function Headline({ data, loading }: { data: MetricsResponse; loading: boolean }) {
  const s = data.summary
  const q = data.query
  if (s.n === 0 || s.bias_mw == null || s.p10_mw == null) {
    return (
      <section className="headline">
        <p>No hours in this selection have both a forecast and an actual value.</p>
      </section>
    )
  }
  const direction = s.bias_mw < 0 ? 'over-estimated' : 'under-estimated'
  return (
    <section className={`headline ${loading ? 'loading' : ''}`} aria-live="polite">
      <p>
        Over {periodLabel(q)}, {describeForecast(q)} <strong>{direction} wind by{' '}
        {fmtGW(Math.abs(s.bias_mw))}</strong> on average.{' '}
        {s.p10_mw < 0 ? (
          <>
            In 1 hour in 10, wind came in more than{' '}
            <strong>{fmtGW(-s.p10_mw)} below</strong> the forecast.
          </>
        ) : (
          <>In 9 hours in 10, wind came in at or above the forecast.</>
        )}
      </p>
      <p className="hint">
        That shortfall is power that has to be bought on top of the forecast-based position.
        Figures are measured over {s.n} hourly settlement periods.
      </p>
    </section>
  )
}

interface Tile {
  label: string
  value: string
  note: string
}

export function StatTiles({ data, loading }: { data: MetricsResponse; loading: boolean }) {
  const s = data.summary
  const c = data.coverage
  const tiles: Tile[] = [
    { label: 'Mean absolute error', value: fmtGW(s.mae_mw, 2), note: 'Typical size of a miss' },
    {
      label: 'Bias (actual − forecast)',
      value: fmtSignedGW(s.bias_mw, 2),
      note: s.bias_mw != null && s.bias_mw < 0 ? 'Forecast runs high' : 'Forecast runs low',
    },
    { label: 'RMSE', value: fmtGW(s.rmse_mw, 2), note: 'Weights large misses more' },
    {
      label: 'Error vs mean output',
      value: fmtPct(s.nmae_pct),
      note: `MAE ÷ mean actual (${fmtGW(s.mean_actual_mw)})`,
    },
    {
      label: 'Error range, P10 to P90',
      value: `${fmtSignedGW(s.p10_mw).replace(' GW', '')} / ${fmtSignedGW(s.p90_mw)}`,
      note: '8 hours in 10 fall between these errors',
    },
    {
      label: 'Coverage',
      value: `${c.matched_hours} / ${c.target_hours} h`,
      note: c.missing_hours ? `${c.missing_hours} h had no eligible forecast` : 'Every hour scored',
    },
  ]
  return (
    <section className={`tiles ${loading ? 'loading' : ''}`} aria-label="Accuracy summary">
      {tiles.map((t) => (
        <div className="tile" key={t.label}>
          <span className="tile-label">{t.label}</span>
          <span className="tile-value">{t.value}</span>
          <span className="tile-note">{t.note}</span>
        </div>
      ))}
    </section>
  )
}
