// Recharts styling shared by every chart. Colours are CSS tokens from index.css.
export const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 12 }
export const AXIS_LINE = { stroke: 'var(--axis)' }
export const GRID_STROKE = 'var(--grid)'

const NICE_STEPS_MW = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000]

/** Round-number ticks (in MW) covering [lo, hi] with at most maxTicks ticks. */
export function niceTicks(lo: number, hi: number, maxTicks = 6): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return []
  if (hi <= lo) hi = lo + 1
  const step =
    NICE_STEPS_MW.find((s) => Math.ceil(hi / s) - Math.floor(lo / s) + 1 <= maxTicks) ??
    NICE_STEPS_MW[NICE_STEPS_MW.length - 1]!
  const ticks: number[] = []
  for (let t = Math.floor(lo / step) * step; t <= Math.ceil(hi / step) * step + 1e-9; t += step) {
    ticks.push(t)
  }
  return ticks
}

/** Ticks for values that are all >= 0: anchor the axis at zero. */
export function ticksFromZero(values: (number | null | undefined)[], maxTicks = 6): number[] {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  return niceTicks(0, Math.max(0, ...nums), maxTicks)
}

export function ticksFor(values: (number | null | undefined)[], maxTicks = 6): number[] {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  return nums.length ? niceTicks(Math.min(...nums), Math.max(...nums), maxTicks) : []
}
