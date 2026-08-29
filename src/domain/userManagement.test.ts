import { describe, expect, it } from 'vitest'
import { emailMatchesDomain, normalizeEmailDomain, normalizedEmail } from './userManagement'

describe('user management email rules', () => {
  it('normalizes a customer domain without an at-sign', () => {
    expect(normalizeEmailDomain(' @Portal.Acme.COM ')).toBe('portal.acme.com')
  })

  it('rejects malformed domains', () => {
    expect(() => normalizeEmailDomain('acme')).toThrow(/valid company email domain/i)
    expect(() => normalizeEmailDomain('acme..com')).toThrow(/valid company email domain/i)
    expect(() => normalizeEmailDomain('https://acme.com')).toThrow(/valid company email domain/i)
  })

  it('matches only the exact configured domain', () => {
    expect(emailMatchesDomain('Person@Acme.com', 'acme.com')).toBe(true)
    expect(emailMatchesDomain('person@sub.acme.com', 'acme.com')).toBe(false)
    expect(emailMatchesDomain('person@notacme.com', 'acme.com')).toBe(false)
  })

  it('rejects addresses with missing or repeated separators', () => {
    expect(normalizedEmail('person@acme.com')).toBe('person@acme.com')
    expect(() => normalizedEmail('person@@acme.com')).toThrow(/valid email/i)
    expect(() => normalizedEmail('@acme.com')).toThrow(/valid email/i)
  })
})
