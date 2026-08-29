const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const productionPathPattern = new RegExp(`^/produce/(${uuidPattern})/(${uuidPattern})/?$`, 'i')
const toolAssemblyPathPattern = new RegExp(`^/app/tools/(${uuidPattern})/?$`, 'i')

export function getShopCoreRouteFromQrData(value: string, appOrigin: string): string {
  let url: URL
  try {
    url = new URL(value.trim(), appOrigin)
  } catch {
    throw new Error('This is not a valid ShopCore QR code.')
  }

  if (url.origin !== appOrigin || url.username || url.password || url.hash) {
    throw new Error('This QR code does not belong to this ShopCore app.')
  }

  const productionMatch = productionPathPattern.exec(url.pathname)
  if (productionMatch) {
    if (url.search) throw new Error('This QR code does not belong to this ShopCore app.')
    return `/produce/${productionMatch[1].toLowerCase()}/${productionMatch[2].toLowerCase()}`
  }

  const toolAssemblyMatch = toolAssemblyPathPattern.exec(url.pathname)
  const toolQuery = [...url.searchParams.entries()]
  const validToolQuery = toolQuery.length === 0 || (toolQuery.length === 1 && toolQuery[0][0] === 'action' && toolQuery[0][1] === 'checkout')
  if (toolAssemblyMatch && validToolQuery) {
    return `/app/tools/${toolAssemblyMatch[1].toLowerCase()}?action=checkout`
  }

  throw new Error('Scan a ShopCore traveler routing-step QR code or Tool Assembly QR label.')
}

export function getProductionRouteFromQrData(value: string, appOrigin: string): string {
  const route = getShopCoreRouteFromQrData(value, appOrigin)
  if (!route.startsWith('/produce/')) throw new Error('Scan a routing-step QR code from a ShopCore traveler.')
  return route
}
