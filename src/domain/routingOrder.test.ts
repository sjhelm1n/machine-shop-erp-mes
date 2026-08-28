import { describe, expect, it } from 'vitest'
import { moveRoutingDraft } from './routingOrder'

const steps = [
  { key: 'saw', name: 'Saw' },
  { key: 'mill', name: 'Mill' },
  { key: 'inspect', name: 'Inspect' },
]

describe('routing draft ordering', () => {
  it('moves an operation later in the routing', () => {
    expect(moveRoutingDraft(steps, 'saw', 2).map((step) => step.key)).toEqual(['mill', 'inspect', 'saw'])
  })

  it('moves an operation earlier in the routing', () => {
    expect(moveRoutingDraft(steps, 'inspect', 0).map((step) => step.key)).toEqual(['inspect', 'saw', 'mill'])
  })

  it('does not mutate the existing routing draft', () => {
    const reordered = moveRoutingDraft(steps, 'mill', 0)
    expect(reordered).not.toBe(steps)
    expect(steps.map((step) => step.key)).toEqual(['saw', 'mill', 'inspect'])
  })
})
