import { ArrowDownRight, BadgeCheck, CalendarClock, CirclePlus, Eye, ShieldCheck, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { ActualBasis, DecisionHour, DecisionResponse } from '../api/types'
import { useBacktest, useDecision } from '../hooks/useApi'
import { useTableToggle } from '../hooks/useTableToggle'
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, ticksFromZero } from '../lib/chartTheme'
import {
  fmtDateTime,
  fmtGW,
  fmtGWh,
  fmtHours,
  fmtLongDay,
  fmtPct,
  fmtSignedGW,
  fmtTime,
  tickGW,
} from '../lib/format'
import { Legend, TooltipBox } from './chartKit'
import { StatGrid, type StatSpec } from './StatGrid'

const CONFIDENCES = [0.5, 0.8, 0.9, 0.95] as const
const LOOKBACKS = [7, 14, 30] as const
const CUTOFF = '11:00'
// Half-hourly decision times, as UK wall-clock "HH:MM".
const TIMES = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
)

/** UK date + time to ISO UTC. Decisions are all in January (GMT), so UK time == UTC. */
const toIso = (day: string, time: string) => `${day}T${time}:00Z`

interface Props {
  basis: ActualBasis
}

export function DecisionPanel({ basis }: Props) {
  const [day, setDay] = useState('2026-01-31')
  const [time, setTime] = useState(CUTOFF)
  const [confidence, setConfidence] = useState(0.9)
  const [lookbackDays, setLookbackDays] = useState(30)
  const [reveal, setReveal] = useState(false)

  const params = { decisionTime: toIso(day, time), confidence, lookbackDays, basis }
  const decision = useDecision(params)
  const backtest = useBacktest({ confidence, lookbackDays, basis }, Number(time.slice(0, 2)))
  const d = decision.data
  const pct = `${Math.round(confidence * 100)}%`

  return (
    <section className="section" aria-label="Plan tomorrow's purchase">
      <div className="filters" aria-label="Decision settings">
        <div className="field">
          <span className="field-label">Decision made on</span>
          <div className="field-row">
            <input
              className="input"
              type="date"
              aria-label="Decision day"
              value={day}
              min="2026-01-01"
              max="2026-01-31"
              onChange={(e) => e.target.value && setDay(e.target.value)}
            />
            <select
              className="select"
              aria-label="Decision time (UK)"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            >
              {TIMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                  {t === CUTOFF ? ' (auction closes)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <span className="field-label">Confidence wind turns up</span>
          <div className="segmented" role="group" aria-label="Confidence">
            {CONFIDENCES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={confidence === c}
                onClick={() => setConfidence(c)}
              >
                {Math.round(c * 100)}%
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Learn errors from last</span>
          <div className="segmented" role="group" aria-label="Lookback">
            {LOOKBACKS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={lookbackDays === n}
                onClick={() => setLookbackDays(n)}
              >
                {n} days
              </button>
            ))}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} />
          Show what actually happened
        </label>
      </div>

      {decision.isError && (
        <div className="notice error" role="alert">
          {decision.error.message}
        </div>
      )}

      {d && (
        <div className={`stack ${decision.isFetching ? 'loading' : ''}`}>
          <LatestForecastLine d={d} />
          <DecisionTiles d={d} pct={pct} reveal={reveal} />
          <div className="grid-2">
            <DeliveryDayChart d={d} pct={pct} reveal={reveal} />
            <RunsCard d={d} />
          </div>
          {backtest.data && (
            <p className="backtest" aria-live="polite">
              <BadgeCheck size={20} aria-hidden />
              <span>
              <strong>Is the {pct} line trustworthy?</strong> Replaying this rule for all{' '}
              {backtest.data.days.length} January decisions at {time.slice(0, 2)}:00, actual wind
              came in at or above it in{' '}
              <strong>{fmtPct(backtest.data.hit_rate_pct)}</strong> of {backtest.data.hours} hours
              (target {pct}). Average extra cover: {fmtGWh(backtest.data.mean_extra_cover_mwh)}{' '}
              a day.
              </span>
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function LatestForecastLine({ d }: { d: DecisionResponse }) {
  if (!d.run_publish_time) {
    return (
      <section className="headline">
        <p>No forecast had been published for this day yet.</p>
      </section>
    )
  }
  const ageH = (Date.parse(d.decision_time) - Date.parse(d.run_publish_time)) / 36e5
  const cutoff = Date.parse(`${d.decision_time.slice(0, 10)}T${CUTOFF}:00Z`)
  const next = d.next_run_publish_time ? Date.parse(d.next_run_publish_time) : null
  return (
    <section className="headline" aria-live="polite">
      <span className="headline-icon" aria-hidden>
        <CalendarClock size={20} />
      </span>
      <div>
      <p>
        At <strong>{fmtDateTime(d.decision_time)}</strong>, the latest wind forecast for{' '}
        <strong>{fmtLongDay(d.delivery_start)}</strong> is the run published at{' '}
        <strong>{fmtTime(d.run_publish_time)}</strong> ({fmtHours(Math.round(ageH * 10) / 10)}{' '}
        old).
      </p>
      <p className="hint">
        {next == null
          ? 'No later run in the data.'
          : next > cutoff && Date.parse(d.decision_time) <= cutoff
            ? `The next run (${fmtTime(next)}) arrives after the 11:00 auction closes, so this is the forecast to buy on.`
            : `The next run is due at ${fmtTime(next)}.`}{' '}
        {d.runs.length} runs for this day had been published by then.
      </p>
      </div>
    </section>
  )
}

function DecisionTiles({ d, pct, reveal }: { d: DecisionResponse; pct: string; reveal: boolean }) {
  const t = d.totals
  const m = d.error_model
  const avg = d.hours.length ? t.forecast_mwh / d.hours.length : null
  const tiles: StatSpec[] = [
    {
      label: 'Forecast wind tomorrow',
      value: fmtGWh(t.forecast_mwh),
      note: `Average ${fmtGW(avg)} over ${d.hours.length} h`,
      icon: Zap,
      tone: 'orange',
    },
    {
      label: `Wind to count on (${pct})`,
      value: fmtGWh(t.count_on_mwh),
      note: `Actual wind beats this ${pct} of the time`,
      icon: ShieldCheck,
      tone: 'green',
    },
    {
      label: 'Extra cover to buy',
      value: fmtGWh(t.extra_cover_mwh),
      note: 'Beyond a position based on the forecast',
      icon: CirclePlus,
      tone: 'blue',
    },
    {
      label: 'Recent forecast error',
      value: fmtSignedGW(m.bias_mw, 2),
      note: m.n
        ? `Bias over ${m.n} known hours · MAE ${fmtGW(m.mae_mw, 2)}`
        : 'No known errors in this window yet',
      icon: ArrowDownRight,
      tone: 'violet',
    },
  ]
  if (reveal) {
    tiles.push({
      label: 'What actually happened',
      value: fmtGWh(t.actual_mwh),
      note:
        t.hours_below_count_on == null
          ? 'Hindsight: not known at decision time'
          : `Below the ${pct} line in ${t.hours_below_count_on} of ${d.hours.length} h`,
      icon: Eye,
      tone: 'slate',
    })
  }
  return <StatGrid tiles={tiles} label="Purchase summary" />
}

interface Row {
  t: number
  forecast: number
  low: number | null
  band: [number, number] | null
  actual: number | null
  h: DecisionHour
}

function DeliveryDayChart({ d, pct, reveal }: { d: DecisionResponse; pct: string; reveal: boolean }) {
  const [asTable, toggle] = useTableToggle()
  const rows = useMemo<Row[]>(
    () =>
      d.hours.map((h) => ({
        t: Date.parse(h.start_time),
        forecast: h.forecast_mw,
        low: h.low_mw,
        band: h.low_mw != null && h.high_mw != null ? [h.low_mw, h.high_mw] : null,
        actual: h.actual_mw,
        h,
      })),
    [d.hours],
  )
  const yTicks = ticksFromZero(
    d.hours.flatMap((h) => [h.forecast_mw, h.high_mw, reveal ? h.actual_mw : null]),
  )
  const legend = [
    { label: 'Latest forecast', color: 'var(--series-forecast)', kind: 'line' as const },
    { label: `Count on (${pct})`, color: 'var(--text-secondary)', kind: 'line' as const },
    { label: 'Likely range', color: 'var(--band)', kind: 'rect' as const },
    ...(reveal ? [{ label: 'Actual', color: 'var(--series-actual)', kind: 'line' as const }] : []),
  ]

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{fmtLongDay(d.delivery_start)}, hour by hour</h2>
          <p className="card-sub">
            The range is the forecast shifted by recent errors; its lower edge is the wind to count
            on.
          </p>
        </div>
        <div className="field-row">
          <Legend items={legend} />
          {toggle}
        </div>
      </div>
      {asTable ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hour (UK)</th>
                <th>Forecast</th>
                <th>Count on</th>
                <th>Range high</th>
                <th>Lead</th>
                {reveal && <th>Actual</th>}
              </tr>
            </thead>
            <tbody>
              {d.hours.map((h) => (
                <tr key={h.start_time}>
                  <td>{fmtTime(h.start_time)}</td>
                  <td>{fmtGW(h.forecast_mw, 2)}</td>
                  <td>{fmtGW(h.low_mw, 2)}</td>
                  <td>{fmtGW(h.high_mw, 2)}</td>
                  <td>{fmtHours(h.lead_h)}</td>
                  {reveal && <td>{fmtGW(h.actual_mw, 2)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(t: number) => fmtTime(t)}
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                ticks={yTicks}
                domain={[0, yTicks.at(-1) ?? 'auto']}
                tickFormatter={tickGW}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                isAnimationActive={false}
                cursor={{ stroke: 'var(--axis)' }}
                content={({ active, payload }) => {
                  const r = payload?.[0]?.payload as Row | undefined
                  if (!active || !r) return null
                  return (
                    <TooltipBox
                      title={`${fmtTime(r.t)} UK`}
                      rows={[
                        {
                          label: 'Forecast',
                          value: fmtGW(r.forecast, 2),
                          color: 'var(--series-forecast)',
                        },
                        {
                          label: `Count on (${pct})`,
                          value: fmtGW(r.low, 2),
                          color: 'var(--text-secondary)',
                        },
                        ...(reveal
                          ? [
                              {
                                label: 'Actual',
                                value: fmtGW(r.actual, 2),
                                color: 'var(--series-actual)',
                              },
                            ]
                          : []),
                      ]}
                      foot={`Forecast made ${fmtHours(r.h.lead_h)} ahead`}
                    />
                  )
                }}
              />
              <Area
                dataKey="band"
                stroke="none"
                fill="var(--band)"
                fillOpacity={1}
                isAnimationActive={false}
                activeDot={false}
              />
              <Line
                dataKey="low"
                stroke="var(--text-secondary)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="forecast"
                stroke="var(--series-forecast)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
              {reveal && (
                <Line
                  dataKey="actual"
                  stroke="var(--series-actual)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

function RunsCard({ d }: { d: DecisionResponse }) {
  const runs = [...d.runs].reverse() // newest first
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>How this forecast changed</h2>
          <p className="card-sub">
            Every run for {fmtLongDay(d.delivery_start)} published by decision time, newest first.
            The one to buy on is in bold.
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Published (UK)</th>
              <th>Average</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => {
              const prev = runs[i + 1]
              return (
                <tr
                  key={r.publish_time}
                  className={r.publish_time === d.run_publish_time ? 'is-chosen' : ''}
                >
                  <td>{fmtDateTime(r.publish_time)}</td>
                  <td>{fmtGW(r.mean_forecast_mw, 2)}</td>
                  <td>{prev ? fmtSignedGW(r.mean_forecast_mw - prev.mean_forecast_mw, 2) : '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
