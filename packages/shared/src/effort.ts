import type { EffortUnit } from './constants'

/** Mirrors the DB generated column: round(hours * 60) or minutes. */
export function toEffortMinutes(value: number, unit: EffortUnit): number {
  return Math.round(unit === 'hours' ? value * 60 : value)
}

/** 90 -> "1h 30m", 45 -> "45m", 0 -> "0m" */
export function formatEffort(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes))
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h === 0) return `${rem}m`
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}
