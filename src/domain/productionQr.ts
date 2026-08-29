const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const productionPathPattern = new RegExp(`^/produce/(${uuidPattern})/(${uuidPattern})/?$`, 'i')

export function getProductionRouteFromQrData(value: string, appOrigin: string): string {
  let url: URL
  try {
    url = new URL(value.trim(), appOrigin)
  } catch {
    throw new Error('This is not a valid ShopCore production QR code.')
  }

  if (url.origin !== appOrigin || url.username || url.password || url.search || url.hash) {
    throw new Error('This QR code does not belong to this ShopCore app.')
  }

  const match = productionPathPattern.exec(url.pathname)
  if (!match) throw new Error('Scan a routing-step QR code from a ShopCore traveler.')

  return `/produce/${match[1].toLowerCase()}/${match[2].toLowerCase()}`
}
