import { niceTicks, ticksFor, ticksFromZero } from './chartTheme'

describe('niceTicks', () => {
  it('uses round GW steps and covers the range', () => {
    expect(niceTicks(0, 21353)).toEqual([0, 5000, 10000, 15000, 20000, 25000])
    expect(niceTicks(0, 2900)).toEqual([0, 1000, 2000, 3000])
    expect(niceTicks(0, 2900, 8)).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000])
  })

  it('covers ranges that do not start at zero', () => {
    const ticks = ticksFor([14050, 21300])
    expect(ticks[0]).toBeLessThanOrEqual(14050)
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(21300)
    expect(ticks.length).toBeLessThanOrEqual(6)
  })

  it('ignores nulls and handles empty input', () => {
    expect(ticksFromZero([null, 1800, undefined])).toEqual([0, 500, 1000, 1500, 2000])
    expect(ticksFor([])).toEqual([])
  })
})
