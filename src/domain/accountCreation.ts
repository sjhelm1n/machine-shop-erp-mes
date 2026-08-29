export const ACCOUNT_CREATION_HOLD_MS = 3000

export function normalizeCompanyName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

export function getCompanyNameError(name: string) {
  const normalized = normalizeCompanyName(name)
  return normalized.length >= 1 && normalized.length <= 160 ? null : 'Company name must be between 1 and 160 characters.'
}

export function getEmailDomain(email: string) {
  const normalized = email.trim().toLowerCase()
  if ((normalized.match(/@/g) ?? []).length !== 1) return null
  const domain = normalized.split('@')[1]
  if (!domain || domain.length < 3 || domain.length > 253) return null
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return null
  return /^[a-z0-9.-]+$/.test(domain) ? domain : null
}

export function getBusinessEmailError(email: string) {
  const domain = getEmailDomain(email)
  if (!domain) return 'Enter a valid email address.'
  return null
}

export function isAccountCreationComputer(viewportWidth: number, hasFinePointer: boolean) {
  return viewportWidth >= 900 && hasFinePointer
}
