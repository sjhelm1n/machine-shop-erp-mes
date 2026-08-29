import { describe, expect, it } from 'vitest'
import { getBusinessEmailError, getCompanyNameError, getEmailDomain, isAccountCreationComputer, normalizeCompanyName } from './accountCreation'

describe('first account creation', () => {
  it('normalizes email domains', () => {
    expect(getEmailDomain(' Owner@Example-Shop.COM ')).toBe('example-shop.com')
  })

  it('accepts personal providers but rejects malformed addresses', () => {
    expect(getBusinessEmailError('owner@gmail.com')).toBeNull()
    expect(getBusinessEmailError('owner@@shop.example')).toMatch(/valid/i)
  })

  it('requires a computer-sized fine-pointer device', () => {
    expect(isAccountCreationComputer(1200, true)).toBe(true)
    expect(isAccountCreationComputer(899, true)).toBe(false)
    expect(isAccountCreationComputer(1200, false)).toBe(false)
  })

  it('normalizes and validates the company name collected at sign-up', () => {
    expect(normalizeCompanyName('  Acme   Machine Shop  ')).toBe('Acme Machine Shop')
    expect(getCompanyNameError('   ')).toMatch(/company name/i)
    expect(getCompanyNameError('Acme Machine Shop')).toBeNull()
  })
})
