// Shared chart chrome: legend and tooltip shell.
import type { ReactNode } from 'react'

export interface LegendEntry {
  label: string
  color: string
  kind: 'line' | 'rect'
}

export function Legend({ items }: { items: LegendEntry[] }) {
  return (
    <div className="legend" role="list">
      {items.map((it) => (
        <span className="legend-item" role="listitem" key={it.label}>
          <span
            className={it.kind === 'line' ? 'key-line' : 'key-rect'}
            style={{ background: it.color }}
            aria-hidden
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}

export interface TooltipRow {
  label: string
  value: string
  color?: string
}

export function TooltipBox({
  title,
  rows,
  foot,
}: {
  title: string
  rows: TooltipRow[]
  foot?: ReactNode
}) {
  return (
    <div className="tooltip">
      <div className="tooltip-title">{title}</div>
      {rows.map((r) => (
        <div className="tooltip-row" key={r.label}>
          <span className="key-line" style={{ background: r.color ?? 'transparent' }} aria-hidden />
          <span className="k">{r.label}</span>
          <span className="v">{r.value}</span>
        </div>
      ))}
      {foot && <div className="tooltip-foot">{foot}</div>}
    </div>
  )
}
