export const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`))
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export function daysUntil(value: string): number {
  const today = new Date()
  const due = new Date(`${value}T23:59:59`)
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000)
}

export function sanitizePlainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/\b[a-z0-9][a-z0-9-]*\.[a-z]{2,}(?:[/?#:]\S*)?/gi, '')
    .trim()
    .slice(0, 2000)
}
