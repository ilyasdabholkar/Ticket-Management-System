import { orgToday } from '@tms/shared'

export type RangePreset = 'today' | 'week' | 'month' | 'custom'

/** Date-only arithmetic on YYYY-MM-DD strings (UTC-based, no timezone drift). */
const toDate = (s: string) => new Date(`${s}T00:00:00Z`)
const toStr = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (s: string, n: number) => {
  const d = toDate(s)
  d.setUTCDate(d.getUTCDate() + n)
  return toStr(d)
}

/** Organisation-date ranges (Asia/Kolkata; weeks start Monday, decision Q8). */
export function presetRange(p: Exclude<RangePreset, 'custom'>): [string, string] {
  const today = orgToday()
  if (p === 'today') return [today, today]
  if (p === 'week') return [addDays(today, -((toDate(today).getUTCDay() + 6) % 7)), today]
  return [`${today.slice(0, 8)}01`, today]
}

const fmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
export const formatDay = (s: string) => fmt.format(toDate(s))
