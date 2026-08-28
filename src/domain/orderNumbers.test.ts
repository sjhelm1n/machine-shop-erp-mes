import { describe, expect, it } from 'vitest'
import { nextChronologicalNumber } from './orderNumbers'

describe('chronological order numbers', () => {
  it('increments sales-order numbers with a four-digit minimum', () => {
    expect(nextChronologicalNumber(['001', '1234'], 4)).toBe('1235')
  })

  it('increments work-order numbers while preserving six-digit padding', () => {
    expect(nextChronologicalNumber(['001', '001234'], 6)).toBe('001235')
  })

  it('starts from one and ignores legacy nonnumeric values', () => {
    expect(nextChronologicalNumber(['SO-A'], 4)).toBe('0001')
    expect(nextChronologicalNumber([], 6)).toBe('000001')
  })
})
