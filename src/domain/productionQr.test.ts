import { describe, expect, it } from 'vitest'
import { getProductionRouteFromQrData, getShopCoreRouteFromQrData } from './productionQr'

const origin = 'https://shop.example.com'
const workOrderId = '10000000-0000-4000-a000-000000000001'
const stepId = '20000000-0000-4000-a000-000000000002'
const route = `/produce/${workOrderId}/${stepId}`
const toolAssemblyId = '30000000-0000-4000-a000-000000000003'
const toolRoute = `/app/tools/${toolAssemblyId}`

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

  it('uses the same scanner for Tool Assembly labels and opens checkout directly', () => {
    expect(getShopCoreRouteFromQrData(`${origin}${toolRoute}?action=checkout`, origin)).toBe(`${toolRoute}?action=checkout`)
    expect(getShopCoreRouteFromQrData(toolRoute, origin)).toBe(`${toolRoute}?action=checkout`)
    expect(() => getProductionRouteFromQrData(toolRoute, origin)).toThrow(/routing-step/i)
  })

  it('rejects unsafe or unrelated routes in the dual-purpose scanner', () => {
    expect(() => getShopCoreRouteFromQrData(`https://attacker.example${toolRoute}`, origin)).toThrow(/does not belong/i)
    expect(() => getShopCoreRouteFromQrData(`${origin}${toolRoute}?action=edit`, origin)).toThrow(/Tool Assembly/i)
    expect(() => getShopCoreRouteFromQrData(`${origin}/app/users`, origin)).toThrow(/Tool Assembly/i)
  })
})
