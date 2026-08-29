import { describe, expect, it } from 'vitest'
import vercelConfig from '../../vercel.json'

const headers = Object.fromEntries(vercelConfig.headers[0].headers.map(({ key, value }) => [key, value]))

describe('production QR scanner browser policies', () => {
  it('allows camera access only from the ShopCore origin', () => {
    expect(headers['Permissions-Policy']).toContain('camera=(self)')
    expect(headers['Permissions-Policy']).not.toContain('camera=()')
  })

  it('allows the bundled QR decoder worker without permitting external workers', () => {
    expect(headers['Content-Security-Policy']).toContain("worker-src 'self' blob:")
    expect(headers['Content-Security-Policy']).not.toMatch(/worker-src[^;]*https:/)
  })
})
