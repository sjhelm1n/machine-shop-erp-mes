import { describe, expect, it } from 'vitest'
import { getProductionRouteFromQrData } from './productionQr'

const origin = 'https://shop.example.com'
const workOrderId = '10000000-0000-4000-a000-000000000001'
const stepId = '20000000-0000-4000-a000-000000000002'
const route = `/produce/${workOrderId}/${stepId}`

describe('production traveler QR navigation', () => {
  it('accepts the authenticated app route encoded by a traveler', () => {
    expect(getProductionRouteFromQrData(`${origin}${route}`, origin)).toBe(route)
    expect(getProductionRouteFromQrData(route, origin)).toBe(route)
  })

  it('rejects routes from another origin', () => {
    expect(() => getProductionRouteFromQrData(`https://attacker.example${route}`, origin)).toThrow(/does not belong/i)
  })

  it('rejects non-production, malformed, and decorated routes', () => {
    expect(() => getProductionRouteFromQrData(`${origin}/app/users`, origin)).toThrow(/routing-step/i)
    expect(() => getProductionRouteFromQrData(`${origin}${route}?next=https://attacker.example`, origin)).toThrow(/does not belong/i)
    expect(() => getProductionRouteFromQrData(`${origin}/produce/not-a-uuid/${stepId}`, origin)).toThrow(/routing-step/i)
  })
})
