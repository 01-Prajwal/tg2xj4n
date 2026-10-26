import type { LucideIcon } from 'lucide-react'

export type Tone = 'blue' | 'green' | 'orange' | 'violet' | 'rose' | 'slate'

export interface StatSpec {
  label: string
  value: string
  note: string
  icon: LucideIcon
  tone: Tone
}

/** A row of KPI tiles, each with a tinted icon badge. */
export function StatGrid({
  tiles,
  label,
  loading = false,
}: {
  tiles: StatSpec[]
  label: string
  loading?: boolean
}) {
  return (
    <section className={`tiles ${loading ? 'loading' : ''}`} aria-label={label}>
      {tiles.map(({ label: l, value, note, icon: Icon, tone }) => (
        <div className="tile" key={l}>
          <div className="tile-top">
            <span className={`tile-icon tone-${tone}`} aria-hidden>
              <Icon size={18} strokeWidth={2.2} />
            </span>
            <span className="tile-label">{l}</span>
          </div>
          <span className="tile-value">{value}</span>
          <span className="tile-note">{note}</span>
        </div>
      ))}
    </section>
  )
}
