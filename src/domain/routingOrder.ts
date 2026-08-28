export interface RoutingDraftItem {
  key: string
}

export function moveRoutingDraft<T extends RoutingDraftItem>(
  steps: T[],
  sourceKey: string,
  targetIndex: number,
): T[] {
  const sourceIndex = steps.findIndex((step) => step.key === sourceKey)
  if (sourceIndex < 0 || steps.length < 2) return steps

  const boundedTarget = Math.max(0, Math.min(targetIndex, steps.length - 1))
  if (sourceIndex === boundedTarget) return steps

  const reordered = [...steps]
  const [moved] = reordered.splice(sourceIndex, 1)
  reordered.splice(boundedTarget, 0, moved)
  return reordered
}
