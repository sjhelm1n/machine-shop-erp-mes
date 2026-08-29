import { describe, expect, it } from 'vitest'
import { addCalendarDays, calendarDateInTimeZone, calendarDaysBetween, daysUntil, formatDate, formatDateTime, isPastBusinessDate, sanitizePlainText, startOfCalendarBucket } from './format'

describe('ERP date and time semantics', () => {
  it('formats a business date without shifting it through a browser timezone', () => {
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026')
    expect(formatDate('not-a-date')).toBe('—')
  })

  it('derives today from the plant timezone on both sides of UTC midnight', () => {
    const instant = new Date('2026-08-29T02:30:00.000Z')
    expect(calendarDateInTimeZone('America/Detroit', instant)).toBe('2026-08-28')
    expect(calendarDateInTimeZone('Asia/Tokyo', instant)).toBe('2026-08-29')
  })

  it('compares calendar days rather than fixed 24-hour durations across DST', () => {
    const beforeSpringForward = new Date('2026-03-08T04:30:00.000Z')
    expect(daysUntil('2026-03-09', 'America/Detroit', beforeSpringForward)).toBe(2)
    expect(isPastBusinessDate('2026-03-07', 'America/Detroit', beforeSpringForward)).toBe(false)

    const afterLocalMidnight = new Date('2026-03-08T05:30:00.000Z')
    expect(daysUntil('2026-03-09', 'America/Detroit', afterLocalMidnight)).toBe(1)
    expect(isPastBusinessDate('2026-03-07', 'America/Detroit', afterLocalMidnight)).toBe(true)
  })

  it('renders timestamps in the explicitly selected plant timezone', () => {
    expect(formatDateTime('2026-08-29T02:30:00.000Z', 'America/Detroit')).toContain('Aug 28')
    expect(formatDateTime('2026-08-29T02:30:00.000Z', 'Asia/Tokyo')).toContain('Aug 29')
  })

  it('does calendar arithmetic without converting business dates through local time', () => {
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(calendarDaysBetween('2026-02-28', '2026-03-02')).toBe(2)
    expect(startOfCalendarBucket('2026-08-30', 'week')).toBe('2026-08-24')
    expect(startOfCalendarBucket('2026-08-30', 'month')).toBe('2026-08-01')
  })
})

describe('sanitizePlainText', () => {
  it('removes markup and common link forms from customer messages', () => {
    expect(sanitizePlainText('Status <b>please</b> https://example.com/path')).toBe('Status please')
    expect(sanitizePlainText('See www.example.com or example.org/order/1')).toBe('See  or')
  })

  it('preserves ordinary shop-floor plain text', () => {
    expect(sanitizePlainText('Can you confirm PO 1042 is due Friday?')).toBe('Can you confirm PO 1042 is due Friday?')
  })
})
