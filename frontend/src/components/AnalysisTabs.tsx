import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { ByHorizonResponse, ByHourResponse, MetricsResponse } from '../api/types'
import { fmtGW, fmtPct, fmtSignedGW, tickGW } from '../lib/format'
import { useTableToggle } from '../hooks/useTableToggle'
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, ticksFor, ticksFromZero } from '../lib/chartTheme'
import { Legend, TooltipBox } from './chartKit'

type TabId = 'horizon' | 'hour' | 'distribution'

const TABS: { id: TabId; label: string }[] = [
  { id: 'horizon', label: 'Accuracy vs lead time' },
  { id: 'hour', label: 'By hour of day' },
  { id: 'distribution', label: 'Error distribution' },
]

// Day-ahead decisions for hours 00:00-23:00 use the 09:30 D-1 run: 14.5h-37.5h ahead.
const DAY_AHEAD_LEAD = [14.5, 37.5] as const

interface Props {
  metrics: MetricsResponse
  byHour: ByHourResponse | undefined
  byHorizon: ByHorizonResponse | undefined
  loading: boolean
}

export function AnalysisTabs({ metrics, byHour, byHorizon, loading }: Props) {
  const [tab, setTab] = useState<TabId>('horizon')
  const [asTable, toggle] = useTableToggle()

  return (
    <section className={`card ${loading ? 'loading' : ''}`} aria-busy={loading}>
      <div className="tabs" role="tablist" aria-label="Analysis">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'horizon' && <HorizonPanel data={byHorizon} asTable={asTable} toggle={toggle} />}
        {tab === 'hour' && <HourPanel data={byHour} asTable={asTable} toggle={toggle} />}
        {tab === 'distribution' && (
          <DistributionPanel data={metrics} asTable={asTable} toggle={toggle} />
        )}
      </div>
    </section>
  )
}

interface PanelProps<T> {
  data: T | undefined
  asTable: boolean
  toggle: React.ReactNode
}

function PanelHead({
  title,
  sub,
  legend,
  toggle,
}: {
  title: string
  sub: string
  legend?: React.ReactNode
  toggle: React.ReactNode
}) {
  return (
    <div className="card-head">
      <div>
        <h2>{title}</h2>
        <p className="card-sub">{sub}</p>
      </div>
      <div className="field-row">
        {legend}
        {toggle}
      </div>
    </div>
  )
}

function gwAxis(ticks: number[]) {
  return (
    <YAxis
      ticks={ticks}
      domain={ticks.length ? [ticks[0]!, ticks.at(-1)!] : ['auto', 'auto']}
      tickFormatter={tickGW}
      tick={AXIS_TICK}
      axisLine={false}
      tickLine={false}
      width={44}
    />
  )
}

function HorizonPanel({ data, asTable, toggle }: PanelProps<ByHorizonResponse>) {
  const rows = data?.horizons ?? []
  const yTicks = ticksFromZero(rows.flatMap((r) => [r.mae_mw, r.rmse_mw]))
  return (
    <>
      <PanelHead
        title="How accuracy decays with lead time"
        sub="Error when using the latest forecast published at least this many hours before each hour. The shaded range is where day-ahead decisions sit. Beyond ~42 h some hours have no forecast that old, so coverage drops."
        legend={
          <Legend
            items={[
              { label: 'MAE', color: 'var(--series-actual)', kind: 'line' },
              { label: 'RMSE', color: 'var(--series-forecast)', kind: 'line' },
            ]}
          />
        }
        toggle={toggle}
      />
      {asTable ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lead time ≥</th>
                <th>MAE</th>
                <th>RMSE</th>
                <th>Bias</th>
                <th>Coverage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.horizon_h}>
                  <td>{r.horizon_h} h</td>
                  <td>{fmtGW(r.mae_mw, 2)}</td>
                  <td>{fmtGW(r.rmse_mw, 2)}</td>
                  <td>{fmtSignedGW(r.bias_mw, 2)}</td>
                  <td>{fmtPct(r.coverage_pct, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <ReferenceArea
                x1={DAY_AHEAD_LEAD[0]}
                x2={DAY_AHEAD_LEAD[1]}
                fill="var(--wash)"
                fillOpacity={1}
                label={{
                  value: 'Day-ahead decisions',
                  position: 'insideTop',
                  fill: 'var(--text-muted)',
                  fontSize: 12,
                }}
              />
              <XAxis
                dataKey="horizon_h"
                type="number"
                domain={[0, 'dataMax']}
                ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]}
                tickFormatter={(h: number) => `${h}h`}
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickLine={false}
              />
              {gwAxis(yTicks)}
              <Tooltip
                isAnimationActive={false}
                cursor={{ stroke: 'var(--axis)' }}
                content={({ active, payload }) => {
                  const r = payload?.[0]?.payload as (typeof rows)[number] | undefined
                  if (!active || !r) return null
                  return (
                    <TooltipBox
                      title={`Published ≥ ${r.horizon_h} h ahead`}
                      rows={[
                        { label: 'MAE', value: fmtGW(r.mae_mw, 2), color: 'var(--series-actual)' },
                        {
                          label: 'RMSE',
                          value: fmtGW(r.rmse_mw, 2),
                          color: 'var(--series-forecast)',
                        },
                        { label: 'Bias', value: fmtSignedGW(r.bias_mw, 2) },
                      ]}
                      foot={`${r.n} hours scored (${fmtPct(r.coverage_pct, 0)} coverage)`}
                    />
                  )
                }}
              />
              {(['mae_mw', 'rmse_mw'] as const).map((k) => (
                <Line
                  key={k}
                  dataKey={k}
                  stroke={k === 'mae_mw' ? 'var(--series-actual)' : 'var(--series-forecast)'}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )
}

function HourPanel({ data, asTable, toggle }: PanelProps<ByHourResponse>) {
  const rows = data?.hours ?? []
  const label = (h: number) => `${String(h).padStart(2, '0')}:00`
  const yTicks = ticksFor([0, ...rows.flatMap((r) => [r.mae_mw, r.bias_mw])])
  return (
    <>
      <PanelHead
        title="When in the day the forecast misses"
        sub="Average error by UK hour of day for the selected forecast. Bias below zero means the forecast was higher than what was generated."
        legend={
          <Legend
            items={[
              { label: 'MAE', color: 'var(--series-actual)', kind: 'rect' },
              { label: 'Bias', color: 'var(--series-forecast)', kind: 'line' },
            ]}
          />
        }
        toggle={toggle}
      />
      {asTable ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hour (UK)</th>
                <th>Hours</th>
                <th>MAE</th>
                <th>Bias</th>
                <th>P10</th>
                <th>P90</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.hour}>
                  <td>{label(r.hour)}</td>
                  <td>{r.n}</td>
                  <td>{fmtGW(r.mae_mw, 2)}</td>
                  <td>{fmtSignedGW(r.bias_mw, 2)}</td>
                  <td>{fmtSignedGW(r.p10_mw, 2)}</td>
                  <td>{fmtSignedGW(r.p90_mw, 2)}</td>
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
                dataKey="hour"
                tickFormatter={label}
                interval={2}
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickLine={false}
              />
              {gwAxis(yTicks)}
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Tooltip
                isAnimationActive={false}
                cursor={{ fill: 'var(--wash)' }}
                content={({ active, payload }) => {
                  const r = payload?.[0]?.payload as (typeof rows)[number] | undefined
                  if (!active || !r) return null
                  return (
                    <TooltipBox
                      title={`${label(r.hour)}–${label((r.hour + 1) % 24)} UK`}
                      rows={[
                        { label: 'MAE', value: fmtGW(r.mae_mw, 2), color: 'var(--series-actual)' },
                        {
                          label: 'Bias',
                          value: fmtSignedGW(r.bias_mw, 2),
                          color: 'var(--series-forecast)',
                        },
                        {
                          label: 'P10 … P90',
                          value: `${fmtSignedGW(r.p10_mw)} … ${fmtSignedGW(r.p90_mw)}`,
                        },
                      ]}
                      foot={`${r.n} hours scored`}
                    />
                  )
                }}
              />
              <Bar
                dataKey="mae_mw"
                fill="var(--series-actual)"
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
              <Line
                dataKey="bias_mw"
                stroke="var(--series-forecast)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--series-forecast)', stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )
}

function DistributionPanel({ data, asTable, toggle }: PanelProps<MetricsResponse>) {
  const bins = (data?.histogram ?? []).map((b) => ({ ...b, mid: (b.lo_mw + b.hi_mw) / 2 }))
  const total = bins.reduce((acc, b) => acc + b.count, 0)
  const lo = bins[0]?.lo_mw ?? 0
  const hi = bins.at(-1)?.hi_mw ?? 0
  // Whole-GW ticks on a numeric axis, so labels sit on bin edges, not mid-bin.
  const xTicks: number[] = []
  for (let t = Math.ceil(lo / 1000) * 1000; t <= hi; t += 1000) xTicks.push(t)
  const range = (b: { lo_mw: number; hi_mw: number }) =>
    `${fmtSignedGW(b.lo_mw)} to ${fmtSignedGW(b.hi_mw)}`
  return (
    <>
      <PanelHead
        title="How big the misses are"
        sub="Hours by error (actual − forecast), in 0.5 GW bins. Bars left of zero are hours when less wind turned up than forecast."
        toggle={toggle}
      />
      {asTable ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Error</th>
                <th>Hours</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {bins.map((b) => (
                <tr key={b.lo_mw}>
                  <td>{range(b)}</td>
                  <td>{b.count}</td>
                  <td>{fmtPct(total ? (100 * b.count) / total : null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={bins}
              margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
              barCategoryGap={2}
            >
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="mid"
                type="number"
                domain={[lo, hi]}
                ticks={xTicks}
                tickFormatter={(m: number) => tickGW(m)}
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickLine={false}
                minTickGap={8}
                label={{
                  value: 'Error, GW',
                  position: 'insideBottomRight',
                  offset: -2,
                  fill: 'var(--text-muted)',
                  fontSize: 12,
                }}
              />
              <YAxis
                allowDecimals={false}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                isAnimationActive={false}
                cursor={{ fill: 'var(--wash)' }}
                content={({ active, payload }) => {
                  const b = payload?.[0]?.payload as (typeof bins)[number] | undefined
                  if (!active || !b) return null
                  return (
                    <TooltipBox
                      title={range(b)}
                      rows={[
                        { label: 'Hours', value: String(b.count), color: 'var(--series-actual)' },
                        { label: 'Share', value: fmtPct(total ? (100 * b.count) / total : null) },
                      ]}
                    />
                  )
                }}
              />
              <ReferenceLine x={0} stroke="var(--text-muted)" />
              <Bar
                dataKey="count"
                fill="var(--series-actual)"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )
}
