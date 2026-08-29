export function nextChronologicalNumber(numbers: string[], minimumWidth: number): string {
  const highest = numbers.reduce((currentHighest, value) => {
    const normalized = value.trim()
    if (!/^\d+$/.test(normalized)) return currentHighest
    const parsed = Number(normalized)
    if (!Number.isSafeInteger(parsed)) return currentHighest
    return Math.max(currentHighest, parsed)
  }, 0)

  return String(highest + 1).padStart(minimumWidth, '0')
}

export function nextPrefixedChronologicalNumber(numbers: string[], prefix: string, minimumWidth: number): string {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^${escapedPrefix}(\\d+)$`)
  const numericPortions = numbers.flatMap((value) => {
    const match = value.trim().match(pattern)
    return match ? [match[1]] : []
  })

  return `${prefix}${nextChronologicalNumber(numericPortions, minimumWidth)}`
}
