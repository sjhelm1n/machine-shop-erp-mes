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
