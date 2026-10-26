import { addDays, dateToIso, fmtDateTime, fmtGW, fmtSignedGW, tickGW } from './format'

describe('format', () => {
  it('formats GW with a fixed number of decimals', () => {
    expect(fmtGW(11285.5)).toBe('11.3 GW')
    expect(fmtGW(1995.6, 2)).toBe('2.00 GW')
    expect(fmtGW(null)).toBe('–')
  })

  it('signs GW with a true minus sign and avoids "-0.0"', () => {
    expect(fmtSignedGW(-1728)).toBe('−1.7 GW')
    expect(fmtSignedGW(503)).toBe('+0.5 GW')
    expect(fmtSignedGW(-20)).toBe('0.0 GW')
  })

  it('shows UK local time across the clock change', () => {
    expect(fmtDateTime('2026-01-15T09:30:00Z')).toContain('09:30')
    expect(fmtDateTime('2026-06-15T09:30:00Z')).toContain('10:30')
  })

  it('handles date arithmetic across month ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(dateToIso('2026-01-02')).toBe('2026-01-02T00:00:00Z')
  })

  it('compacts axis ticks to GW', () => {
    expect(tickGW(12000)).toBe('12')
    expect(tickGW(2500)).toBe('2.5')
  })
})
