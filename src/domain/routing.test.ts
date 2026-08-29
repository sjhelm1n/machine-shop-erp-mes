import { describe, expect, it } from 'vitest'
import { calculateStepMetrics, canTransfer, customerStage, isSalesOrderCompleted, salesOrderCompletion, salesOrderProgress, workOrderProgress, workOrderStageBreakdown } from './routing'
import type { ProductionEvent, WorkOrder } from './types'

const workOrder: WorkOrder = {
  id: 'wo', organizationId: 'org', workOrderNumber: '000001', workOrderName: '000001', salesOrderId: 'so', salesOrderLineItemId: 'line',
  partNumber: 'PN-1', quantityOrdered: 100, dueDate: '2026-09-01', releasedAt: '2026-08-01T10:00:00Z',
  completionDate: null, archivedAt: null, notes: '', routing: [
    { id: 's1', workOrderId: 'wo', sequenceNumber: 10, routingStepName: 'Saw', customerStageName: 'In production', workInstructions: '', notes: '' },
    { id: 's2', workOrderId: 'wo', sequenceNumber: 20, routingStepName: 'Mill', customerStageName: 'In production', workInstructions: '', notes: '' },
    { id: 's3', workOrderId: 'wo', sequenceNumber: 30, routingStepName: 'Inspect', customerStageName: 'Inspection', workInstructions: '', notes: '' },
    { id: 's4', workOrderId: 'wo', sequenceNumber: 40, routingStepName: 'Complete', customerStageName: 'Complete', workInstructions: '', notes: '' },
  ],
}

const event = (id: string, eventType: ProductionEvent['eventType'], quantity: number, from: string | null, to: string | null): ProductionEvent => ({
  id, organizationId: 'org', workOrderId: 'wo', routingStepId: from ?? to ?? 's1', eventType, quantity,
  fromRoutingStepId: from, toRoutingStepId: to, reversedEventId: null, actorId: null, requestId: id, createdAt: `2026-08-01T10:0${id.length}:00Z`,
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

  it('completes a sales order only after production, shipping, and invoicing are complete', () => {
    const productionComplete = { ...workOrder, customerProgressPercent: 100 }
    const openOrder = { id: 'so', shippedAt: null, invoicedAt: null }
    const shippedOrder = { ...openOrder, shippedAt: '2026-08-27T12:00:00Z' }
    const fulfilledOrder = { ...shippedOrder, invoicedAt: '2026-08-27T13:00:00Z' }

    expect(salesOrderCompletion(openOrder, [productionComplete], [])).toEqual({
      productionCompleted: true,
      shipped: false,
      invoiced: false,
      completed: false,
    })
    expect(isSalesOrderCompleted(shippedOrder, [productionComplete], [])).toBe(false)
    expect(isSalesOrderCompleted(fulfilledOrder, [workOrder], [])).toBe(false)
    expect(isSalesOrderCompleted(fulfilledOrder, [productionComplete], [])).toBe(true)
  })

  it('reports the percentage of ordered parts currently at each stage', () => {
    const events = [
      event('release', 'release', 100, null, 's1'),
      event('to-mill', 'transfer', 60, 's1', 's2'),
      event('to-inspect', 'transfer', 25, 's2', 's3'),
      event('scrap', 'scrap', 5, 's2', null),
      event('to-complete', 'transfer', 10, 's3', 's4'),
      event('finished', 'transfer', 4, 's4', null),
    ]

    expect(workOrderStageBreakdown(workOrder, events)).toEqual([
      { stageName: 'In production', quantity: 70, percentage: 70 },
      { stageName: 'Inspection', quantity: 15, percentage: 15 },
      { stageName: 'Complete', quantity: 10, percentage: 10 },
      { stageName: 'Scrapped', quantity: 5, percentage: 5 },
    ])
  })

  it('keeps unreleased ordered parts in the order-received stage', () => {
    expect(workOrderStageBreakdown(workOrder, [])).toEqual([
      { stageName: 'Order received', quantity: 100, percentage: 100 },
      { stageName: 'In production', quantity: 0, percentage: 0 },
      { stageName: 'Inspection', quantity: 0, percentage: 0 },
      { stageName: 'Complete', quantity: 0, percentage: 0 },
    ])
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

  it('excludes archived work orders from sales-order progress', () => {
    const completedEvents = [
      event('release', 'release', 100, null, 's1'),
      event('t1', 'transfer', 100, 's1', 's2'),
      event('t2', 'transfer', 100, 's2', 's3'),
      event('t3', 'transfer', 100, 's3', 's4'),
      event('t4', 'transfer', 100, 's4', null),
    ]
    expect(salesOrderProgress([{ ...workOrder, archivedAt: '2026-08-20T10:00:00Z' }], completedEvents, 'so')).toBe(0)
  })
})
