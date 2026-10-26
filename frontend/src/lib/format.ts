// Display helpers. All times are shown in UK local time, which is what traders use.

const UK = 'Europe/London'

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: UK, day: 'numeric', month: 'short' })
const longDayFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const toDate = (t: string | number | Date) => (t instanceof Date ? t : new Date(t))

export const fmtDateTime = (t: string | number | Date) => dateTimeFmt.format(toDate(t))
export const fmtDay = (t: string | number | Date) => dayFmt.format(toDate(t))
export const fmtLongDay = (t: string | number | Date) => longDayFmt.format(toDate(t))

const DASH = '–'

/** 11285.5 -> "11.3 GW" */
export function fmtGW(mw: number | null | undefined, digits = 1): string {
  if (mw == null || Number.isNaN(mw)) return DASH
  return `${(mw / 1000).toFixed(digits)} GW`
}

/** Signed GW with a real minus sign: -1728 -> "−1.7 GW", 503 -> "+0.5 GW" */
export function fmtSignedGW(mw: number | null | undefined, digits = 1): string {
  if (mw == null || Number.isNaN(mw)) return DASH
  const v = (mw / 1000).toFixed(digits)
  if (Number(v) === 0) return `0.${'0'.repeat(digits)} GW`
  return mw > 0 ? `+${v} GW` : `−${v.slice(1)} GW`
}

export function fmtPct(p: number | null | undefined, digits = 1): string {
  if (p == null || Number.isNaN(p)) return DASH
  return `${p.toFixed(digits)}%`
}

export function fmtHours(h: number): string {
  return Number.isInteger(h) ? `${h} h` : `${h.toFixed(1)} h`
}

/** Axis tick: 12000 -> "12" (axis title carries the unit) */
export const tickGW = (mw: number) => `${Math.round(mw / 100) / 10}`

/** "YYYY-MM-DD" (UK date, January is GMT) <-> ISO UTC midnight. */
export const dateToIso = (d: string) => `${d}T00:00:00Z`
export const isoToDate = (iso: string) => iso.slice(0, 10)

export function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

/** 464474 MWh -> "464 GWh" */
export function fmtGWh(mwh: number | null | undefined): string {
  if (mwh == null || Number.isNaN(mwh)) return DASH
  return `${Math.round(mwh / 1000).toLocaleString('en-GB')} GWh`
}

const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: UK, hour: '2-digit', minute: '2-digit' })
export const fmtTime = (t: string | number | Date) => timeFmt.format(toDate(t))
