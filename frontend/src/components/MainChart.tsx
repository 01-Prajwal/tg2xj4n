import { useMemo } from 'react'
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { SeriesPoint, SeriesResponse } from '../api/types'
import { fmtDateTime, fmtDay, fmtHours, fmtSignedGW, fmtGW, tickGW } from '../lib/format'
import { useTableToggle } from '../hooks/useTableToggle'
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, ticksFromZero } from '../lib/chartTheme'
import { Legend, TooltipBox } from './chartKit'

interface Row {
  t: number
  actual: number
  forecast: number
  band: [number, number] | null
  p: SeriesPoint
}

interface Props {
  data: SeriesResponse
  loading: boolean
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  const p = row.p
  return (
    <TooltipBox
      title={fmtDateTime(p.start_time)}
      rows={[
        { label: 'Actual', value: fmtGW(p.actual_mw, 2), color: 'var(--series-actual)' },
        { label: 'Forecast', value: fmtGW(p.forecast_mw, 2), color: 'var(--series-forecast)' },
        { label: 'Error', value: fmtSignedGW(p.error_mw, 2) },
        ...(p.reliable_mw != null
          ? [{ label: 'Reliable (P10)', value: fmtGW(p.reliable_mw, 2), color: 'var(--band)' }]
          : []),
      ]}
      foot={<>Forecast published {fmtDateTime(p.publish_time)} ({fmtHours(p.lead_h)} ahead)</>}
    />
  )
}

export function MainChart({ data, loading }: Props) {
  const [asTable, toggle] = useTableToggle()
  const rows = useMemo<Row[]>(
    () =>
      data.points.map((p) => ({
        t: Date.parse(p.start_time),
        actual: p.actual_mw,
        forecast: p.forecast_mw,
        band: p.reliable_mw != null && p.upper_mw != null ? [p.reliable_mw, p.upper_mw] : null,
        p,
      })),
    [data.points],
  )
  // Daily ticks at UK midnight (= UTC in January).
  const ticks = useMemo(
    () => rows.filter((r) => new Date(r.t).getUTCHours() === 0).map((r) => r.t),
    [rows],
  )
  const yTicks = useMemo(
    () => ticksFromZero(data.points.flatMap((p) => [p.actual_mw, p.forecast_mw, p.upper_mw])),
    [data.points],
  )

  return (
    <section className={`card ${loading ? 'loading' : ''}`} aria-busy={loading}>
      <div className="card-head">
        <div>
          <h2>Wind generation: actual vs forecast</h2>
          <p className="card-sub">
            National wind output, hourly. The shaded band is where actual output landed 8 times in
            10 around a forecast like this one; its lower edge is the wind you can count on.
          </p>
        </div>
        <div className="field-row">
          <Legend
            items={[
              { label: 'Actual', color: 'var(--series-actual)', kind: 'line' },
              { label: 'Forecast', color: 'var(--series-forecast)', kind: 'line' },
              { label: 'P10–P90 range', color: 'var(--band)', kind: 'rect' },
            ]}
          />
          {toggle}
        </div>
      </div>

      {asTable ? (
        <SeriesTable points={data.points} />
      ) : (
        <div style={{ height: 380 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                ticks={ticks}
                tickFormatter={(t: number) => fmtDay(t)}
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
                label={{
                  value: 'GW',
                  position: 'insideTopLeft',
                  offset: 0,
                  dy: -4,
                  fill: 'var(--text-muted)',
                  fontSize: 12,
                }}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
                isAnimationActive={false}
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
                dataKey="forecast"
                stroke="var(--series-forecast)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
              <Line
                dataKey="actual"
                stroke="var(--series-actual)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
              <Brush
                dataKey="t"
                height={26}
                travellerWidth={8}
                stroke="var(--axis)"
                fill="var(--surface)"
                tickFormatter={(t: number) => fmtDay(t)}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

function SeriesTable({ points }: { points: SeriesPoint[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Hour (UK)</th>
            <th>Actual</th>
            <th>Forecast</th>
            <th>Error</th>
            <th>Reliable (P10)</th>
            <th>Published</th>
            <th>Lead</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.start_time}>
              <td>{fmtDateTime(p.start_time)}</td>
              <td>{fmtGW(p.actual_mw, 2)}</td>
              <td>{fmtGW(p.forecast_mw, 2)}</td>
              <td>{fmtSignedGW(p.error_mw, 2)}</td>
              <td>{fmtGW(p.reliable_mw, 2)}</td>
              <td>{fmtDateTime(p.publish_time)}</td>
              <td>{fmtHours(p.lead_h)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
