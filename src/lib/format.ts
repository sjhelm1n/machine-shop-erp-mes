export const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseCalendarDate(value: string): { year: number; month: number; day: number } | null {
  const match = calendarDatePattern.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null
  return { year, month, day }
}

function calendarOrdinal(value: string): number {
  const parsed = parseCalendarDate(value)
  if (!parsed) throw new Error(`Invalid calendar date: ${value}`)
  return Math.floor(Date.UTC(parsed.year, parsed.month - 1, parsed.day) / 86_400_000)
}

function calendarDateFromOrdinal(ordinal: number): string {
  const value = new Date(ordinal * 86_400_000)
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

export function calendarDateInTimeZone(timeZone: string, instant = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function hourInTimeZone(timeZone: string, instant = new Date()): number {
  const value = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(instant)
    .find((part) => part.type === 'hour')?.value
  return Number(value ?? 0)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = parseCalendarDate(value.slice(0, 10))
  if (!parsed) return '—'
  return `${monthNames[parsed.month - 1]} ${parsed.day}, ${parsed.year}`
}

export function formatDateTime(value: string | null | undefined, timeZone: string): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(new Date(value))
}

export function daysUntil(value: string, timeZone: string, instant = new Date()): number {
  return calendarOrdinal(value) - calendarOrdinal(calendarDateInTimeZone(timeZone, instant))
}

export function addCalendarDays(value: string, days: number): string {
  if (!Number.isInteger(days)) throw new Error('Calendar day adjustment must be an integer.')
  return calendarDateFromOrdinal(calendarOrdinal(value) + days)
}

export function calendarDaysBetween(startDate: string, endDate: string): number {
  return calendarOrdinal(endDate) - calendarOrdinal(startDate)
}

export function startOfCalendarBucket(value: string, bucket: 'day' | 'week' | 'month'): string {
  const parsed = parseCalendarDate(value)
  if (!parsed) throw new Error(`Invalid calendar date: ${value}`)
  if (bucket === 'day') return value
  if (bucket === 'month') return `${parsed.year}-${String(parsed.month).padStart(2, '0')}-01`
  const weekday = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay()
  return addCalendarDays(value, -(weekday === 0 ? 6 : weekday - 1))
}

export function isPastBusinessDate(value: string, timeZone: string, instant = new Date()): boolean {
  return daysUntil(value, timeZone, instant) < 0
}

export function sanitizePlainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/\b[a-z0-9][a-z0-9-]*\.[a-z]{2,}(?:[/?#:]\S*)?/gi, '')
    .trim()
    .slice(0, 2000)
}
