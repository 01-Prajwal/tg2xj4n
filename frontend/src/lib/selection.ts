import type { Filters, Health, SeriesPoint, Window } from '../api/types'
import { addDays, isoToDate } from './format'

/** Lead-time slider ceiling: past ~48h too few hours have a forecast that old. */
export const SLIDER_MAX_H = 48

export interface Preset {
  label: string
  from: string // YYYY-MM-DD, inclusive
  to: string // YYYY-MM-DD, exclusive
}

/** "Full period" plus consecutive 7-day weeks of delivery days. */
export function buildPresets(window: Window): Preset[] {
  const first = isoToDate(window.start)
  const end = isoToDate(window.end)
  const presets: Preset[] = [{ label: 'Full period', from: first, to: end }]
  for (let d = first, i = 1; d < end; d = addDays(d, 7), i++) {
    const to = addDays(d, 7) < end ? addDays(d, 7) : end
    presets.push({ label: `Week ${i}`, from: d, to })
  }
  return presets
}

export function defaultFilters(health: Health): Filters {
  const w = health.default_window
  return { from: w.start, to: w.end, mode: 'dayahead', horizonH: 24, basis: 'point' }
}

/** The hour with the largest miss: a good default for the drill-down. */
export function worstHour(points: SeriesPoint[]): string | null {
  let worst: SeriesPoint | null = null
  for (const p of points) {
    if (!worst || Math.abs(p.error_mw) > Math.abs(worst.error_mw)) worst = p
  }
  return worst?.start_time ?? null
}
