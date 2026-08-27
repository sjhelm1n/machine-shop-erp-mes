import { describe, expect, it } from 'vitest'
import { sanitizePlainText } from './format'

describe('sanitizePlainText', () => {
  it('removes markup and common link forms from customer messages', () => {
    expect(sanitizePlainText('Status <b>please</b> https://example.com/path')).toBe('Status please')
    expect(sanitizePlainText('See www.example.com or example.org/order/1')).toBe('See  or')
  })

  it('preserves ordinary shop-floor plain text', () => {
    expect(sanitizePlainText('Can you confirm PO 1042 is due Friday?')).toBe('Can you confirm PO 1042 is due Friday?')
  })
})
