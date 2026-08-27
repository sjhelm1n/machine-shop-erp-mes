import { describe, expect, it } from 'vitest'
import { calculateStepMetrics, canTransfer, customerStage, salesOrderProgress, workOrderProgress } from './routing'
import type { ProductionEvent, WorkOrder } from './types'

const workOrder: WorkOrder = {
  id: 'wo', organizationId: 'org', workOrderNumber: 'WO-1', salesOrderId: 'so', salesOrderLineItemId: 'line',
  partNumber: 'PN-1', quantityOrdered: 100, dueDate: '2026-09-01', releasedAt: '2026-08-01T10:00:00Z',
  completionDate: null, notes: '', routing: [
    { id: 's1', workOrderId: 'wo', sequenceNumber: 10, routingStepName: 'Saw', customerStageName: 'In production', workInstructions: '', workInstructionsRevision: null, notes: '' },
    { id: 's2', workOrderId: 'wo', sequenceNumber: 20, routingStepName: 'Mill', customerStageName: 'In production', workInstructions: '', workInstructionsRevision: null, notes: '' },
    { id: 's3', workOrderId: 'wo', sequenceNumber: 30, routingStepName: 'Inspect', customerStageName: 'Inspection', workInstructions: '', workInstructionsRevision: null, notes: '' },
    { id: 's4', workOrderId: 'wo', sequenceNumber: 40, routingStepName: 'Complete', customerStageName: 'Complete', workInstructions: '', workInstructionsRevision: null, notes: '' },
  ],
}

const event = (id: string, eventType: ProductionEvent['eventType'], quantity: number, from: string | null, to: string | null): ProductionEvent => ({
  id, organizationId: 'org', workOrderId: 'wo', routingStepId: from ?? to ?? 's1', eventType, quantity,
  fromRoutingStepId: from, toRoutingStepId: to, reversedEventId: null, createdAt: `2026-08-01T10:0${id.length}:00Z`,
})

describe('routing calculations', () => {
  it('supports partial transfers, scrap, and one-piece flow', () => {
    const events = [event('r', 'release', 100, null, 's1'), event('a', 'transfer', 1, 's1', 's2'), event('bb', 'scrap', 2, 's1', null)]
    const [first, second] = calculateStepMetrics(workOrder, events)
    expect(first.available).toBe(97)
    expect(first.transferred).toBe(1)
    expect(first.scrapped).toBe(2)
    expect(second.available).toBe(1)
  })

  it('allows overproduction and caps customer progress at 100%', () => {
    const events: ProductionEvent[] = [event('release', 'release', 102, null, 's1')]
    let from = 's1'
    for (const [index, to] of ['s2', 's3', 's4', null].entries()) {
      events.push(event(`t${index}`, 'transfer', 102, from, to))
      from = to ?? 's4'
    }
    expect(workOrderProgress(workOrder, events)).toBe(100)
  })

  it('ignores an event after an immutable reversal', () => {
    const transfer = event('transfer', 'transfer', 5, 's1', 's2')
    const reversal = { ...event('undo', 'reversal', 5, 's1', 's2'), reversedEventId: transfer.id }
    const [first, second] = calculateStepMetrics(workOrder, [event('release', 'release', 100, null, 's1'), transfer, reversal])
    expect(first.available).toBe(100)
    expect(second.available).toBe(0)
  })

  it('uses quantity-weighted sales-order progress', () => {
    const small = { ...workOrder, id: 'small', quantityOrdered: 10, routing: workOrder.routing.map((step) => ({ ...step, id: `small-${step.id}`, workOrderId: 'small' })) }
    const completeSmall = small.routing.flatMap((step, index) => [event(`sm-${index}`, 'transfer', 10, step.id, small.routing[index + 1]?.id ?? null)]).map((item) => ({ ...item, workOrderId: 'small', routingStepId: item.fromRoutingStepId! }))
    expect(salesOrderProgress([workOrder, small], completeSmall, 'so')).toBe(9)
  })

  it('rejects zero, fractional, and excessive transfers', () => {
    expect(canTransfer(1, 1)).toBe(true)
    expect(canTransfer(2, 1)).toBe(false)
    expect(canTransfer(0, 10)).toBe(false)
    expect(canTransfer(1.5, 10)).toBe(false)
  })

  it('uses customer-safe aggregates without exposing routing events', () => {
    const portalWorkOrder: WorkOrder = {
      ...workOrder,
      routing: [],
      customerProgressPercent: 67,
      customerStageName: 'Finishing',
    }
    expect(workOrderProgress(portalWorkOrder, [])).toBe(67)
    expect(customerStage(portalWorkOrder, [])).toBe('Finishing')
  })
})
