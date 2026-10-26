import { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { Vintage, VintagesResponse } from '../api/types'
import { fmtDateTime, fmtGW, fmtHours, fmtSignedGW, tickGW } from '../lib/format'
import { useTableToggle } from '../hooks/useTableToggle'
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, ticksFor } from '../lib/chartTheme'
import { Legend, TooltipBox } from './chartKit'

interface Props {
  data: VintagesResponse | undefined
  loading: boolean
  error: Error | null
}

export function VintagesPanel({ data, loading, error }: Props) {
  const [asTable, toggle] = useTableToggle()
  const rows = useMemo(
    () => (data?.vintages ?? []).map((v) => ({ ...v, t: Date.parse(v.publish_time) })),
    [data],
  )
  const chosen = data?.vintages.find((v) => v.publish_time === data.day_ahead_choice)
  // Include the actual so its reference line is always on-scale.
  const yTicks = ticksFor([...rows.map((r) => r.forecast_mw), data?.actual_mw], 6)

  return (
    <section className={`card ${loading ? 'loading' : ''}`} aria-busy={loading}>
      <div className="card-head">
        <div>
          <h2>How the forecast evolved</h2>
          <p className="card-sub">
            {data
              ? `Every forecast issued for ${fmtDateTime(data.target)}. Click any hour on the main chart to change it.`
              : 'Click an hour on the main chart.'}
          </p>
        </div>
        <div className="field-row">
          <Legend
            items={[
              { label: 'Forecast', color: 'var(--series-forecast)', kind: 'line' },
              { label: 'Actual', color: 'var(--series-actual)', kind: 'line' },
            ]}
          />
          {toggle}
        </div>
      </div>

      {error && <p className="hint">Could not load forecasts for this hour: {error.message}</p>}

      {data && (
        <p className="card-sub" style={{ marginBottom: 10 }}>
          At the 11:00 cutoff the trader saw{' '}
          <strong>{chosen ? fmtGW(chosen.forecast_mw, 2) : 'no forecast'}</strong>; actual output
          was <strong>{fmtGW(data.actual_mw, 2)}</strong>
          {chosen && data.actual_mw != null && (
            <> ({fmtSignedGW(data.actual_mw - chosen.forecast_mw, 2)})</>
          )}
          .
        </p>
      )}

      {data && asTable && <VintageTable rows={data.vintages} chosen={data.day_ahead_choice} />}
      {data && !asTable && (
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 16, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(t: number) => `${Math.round((Date.parse(data.target) - t) / 36e5)}h`}
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                ticks={yTicks}
                domain={yTicks.length ? [yTicks[0]!, yTicks.at(-1)!] : ['auto', 'auto']}
                tickFormatter={tickGW}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <ReferenceLine
                x={Date.parse(data.day_ahead_cutoff)}
                stroke="var(--text-muted)"
                label={{
                  value: '11:00 cutoff',
                  position: 'top',
                  fill: 'var(--text-muted)',
                  fontSize: 12,
                }}
              />
              {data.actual_mw != null && (
                <ReferenceLine y={data.actual_mw} stroke="var(--series-actual)" strokeWidth={2} />
              )}
              <Tooltip
                isAnimationActive={false}
                cursor={{ stroke: 'var(--axis)' }}
                content={({ active, payload }) => {
                  const v = payload?.[0]?.payload as (typeof rows)[number] | undefined
                  if (!active || !v) return null
                  return (
                    <TooltipBox
                      title={`Published ${fmtDateTime(v.publish_time)}`}
                      rows={[
                        {
                          label: 'Forecast',
                          value: fmtGW(v.forecast_mw, 2),
                          color: 'var(--series-forecast)',
                        },
                        { label: 'Actual', value: fmtGW(data.actual_mw, 2), color: 'var(--series-actual)' },
                      ]}
                      foot={`${fmtHours(v.lead_h)} ahead${
                        v.publish_time === data.day_ahead_choice ? ' · used for the day-ahead decision' : ''
                      }`}
                    />
                  )
                }}
              />
              <Line
                dataKey="forecast_mw"
                stroke="var(--series-forecast)"
                strokeWidth={2}
                isAnimationActive={false}
                dot={(props: { cx?: number; cy?: number; payload?: Vintage; index?: number }) => {
                  const isChosen = props.payload?.publish_time === data.day_ahead_choice
                  return (
                    <circle
                      key={props.index}
                      cx={props.cx}
                      cy={props.cy}
                      r={isChosen ? 6 : 3}
                      fill={isChosen ? 'var(--text-primary)' : 'var(--series-forecast)'}
                      stroke="var(--surface)"
                      strokeWidth={2}
                    />
                  )
                }}
                activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {data && !asTable && (
        <p className="hint">
          X axis: hours before delivery. The large dot is the forecast used for the day-ahead
          decision.
        </p>
      )}
    </section>
  )
}

function VintageTable({ rows, chosen }: { rows: Vintage[]; chosen: string | null }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Published (UK)</th>
            <th>Lead</th>
            <th>Forecast</th>
            <th>Before cutoff</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.publish_time} className={v.publish_time === chosen ? 'is-chosen' : ''}>
              <td>
                {fmtDateTime(v.publish_time)}
                {v.publish_time === chosen ? ' (used)' : ''}
              </td>
              <td>{fmtHours(v.lead_h)}</td>
              <td>{fmtGW(v.forecast_mw, 2)}</td>
              <td>{v.before_day_ahead_cutoff ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
