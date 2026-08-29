import type { AppRole } from './types'

const EMAIL_DOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/

export interface ManagedUser {
  id: string
  organizationId: string
  customerId: string | null
  email: string
  displayName: string
  position: string | null
  role: AppRole
  isSuperAdmin: boolean
  invitedAt: string | null
  activatedAt: string | null
}

export interface ManageableCustomer {
  id: string
  customerName: string
  emailDomain: string | null
}

export function normalizeEmailDomain(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^@/, '')
  if (!normalized) return ''
  if (
    normalized.length > 253
    || !normalized.includes('.')
    || normalized.includes('..')
    || !EMAIL_DOMAIN_PATTERN.test(normalized)
  ) {
    throw new Error('Enter a valid company email domain, such as acme.com.')
  }
  return normalized
}

export function normalizedEmail(value: string): string {
  const normalized = value.trim().toLowerCase()
  const separator = normalized.lastIndexOf('@')
  if (separator <= 0 || separator !== normalized.indexOf('@') || separator === normalized.length - 1) {
    throw new Error('Enter a valid email address.')
  }
  return normalized
}

export function emailMatchesDomain(email: string, domain: string): boolean {
  const normalizedDomain = normalizeEmailDomain(domain)
  return normalizedEmail(email).split('@')[1] === normalizedDomain
}
