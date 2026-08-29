import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProductionEvent, RoutingOperationTool, ToolAssembly, ToolCheckoutTransaction, WorkOrder } from './types'
import { checkedOutQuantity, copyRoutingTooling, deriveToolUsage, operationCheckoutError, productionToolCheckoutRequirements, selectableToolAssemblies, validateCheckoutTransaction, validateToolingDraft } from './tooling'

const assembly = (id: string, archivedAt: string | null = null): ToolAssembly => ({
  id, organizationId: 'org', assemblyNumber: id, name: id, description: '',
  quantityCheckedOut: 0, quantityInUse: 0, futureRequirements: 0, usageWarning: false,
  imagePath: null, imageUrl: null, archivedAt, createdAt: '', updatedAt: '',
})

describe('tooling domain rules', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('derives physical checkout independently from usage assignments', () => {
    const rows: ToolCheckoutTransaction[] = [
      { id: '2', organizationId: 'org', toolAssemblyId: 'TA-1', transactionType: 'CHECK_IN', note: '', actorId: 'user', actorDisplayName: 'User', createdAt: '2026-08-29T13:00:00Z' },
      { id: '1', organizationId: 'org', toolAssemblyId: 'TA-1', transactionType: 'CHECK_OUT', note: '', actorId: 'user', actorDisplayName: 'User', createdAt: '2026-08-29T12:00:00Z' },
    ]
    expect(checkedOutQuantity(rows, 'TA-1')).toBe(0)
  })

  it('allows valid single-assembly checkout state changes', () => {
    expect(validateCheckoutTransaction(0, 'CHECK_OUT')).toBeNull()
    expect(validateCheckoutTransaction(1, 'CHECK_IN')).toBeNull()
  })

  it('rejects duplicate checkout and check-in of an available assembly', () => {
    expect(validateCheckoutTransaction(1, 'CHECK_OUT')).toMatch(/already checked out/)
    expect(validateCheckoutTransaction(0, 'CHECK_IN')).toMatch(/not checked out/)
  })

  it('blocks check-in while the assembly is in use', () => {
    expect(validateCheckoutTransaction(1, 'CHECK_IN', 1)).toBe('Tool assembly cannot be checked in while it is in use.')
  })

  it('requires every operation-assigned assembly to be checked out before production', () => {
    const order = workOrder('wo-1', 'op-1')
    expect(operationCheckoutError(order, 'op-1', [assembly('assembly')])).toContain('assembly')
    expect(operationCheckoutError(order, 'op-1', [{ ...assembly('assembly'), quantityCheckedOut: 1 }])).toBeNull()
    expect(operationCheckoutError(order, 'other-op', [assembly('assembly')])).toBeNull()
  })

  it('reports unchecked destination tooling without blocking transfer into the next routing step', () => {
    const order = workOrder('wo-1', 'op-1')
    order.routing.push({ ...order.routing[0], id: 'op-2', sequenceNumber: 20, routingStepName: 'Inspect' })
    order.operationTooling!.push({ ...order.operationTooling![0], id: 'next-tool', workOrderOperationId: 'op-2', toolAssemblyId: 'next-assembly', toolAssemblyNumber: 'TA-002', toolAssemblyName: 'Inspection fixture' })
    const assemblies = [{ ...assembly('assembly'), quantityCheckedOut: 1 }, assembly('next-assembly')]

    expect(operationCheckoutError(order, 'op-1', assemblies)).toBeNull()
    expect(productionToolCheckoutRequirements(order, 'op-1', assemblies)).toEqual(expect.arrayContaining([
      expect.objectContaining({ operationRole: 'next', routingStepId: 'op-2', assemblyNumber: 'next-assembly', checkedOut: false }),
    ]))
  })

  it('validates CNC tool positions and rejects duplicates', () => {
    expect(validateToolingDraft([{ key: '1', toolAssemblyId: 'a', toolNumber: 't03', notes: '' }])).toBeNull()
    expect(validateToolingDraft([{ key: '1', toolAssemblyId: 'a', toolNumber: '3', notes: '' }])).toMatch(/CNC notation/)
    expect(validateToolingDraft([
      { key: '1', toolAssemblyId: 'a', toolNumber: 'T03', notes: '' },
      { key: '2', toolAssemblyId: 'b', toolNumber: 't03', notes: '' },
    ])).toMatch(/more than once/)
  })

  it('copies routing defaults into independent work-order assignments', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'work-order-tool') })
    const defaults: RoutingOperationTool[] = [{
      id: 'routing-tool', routingOperationId: 'routing-op', toolAssemblyId: 'assembly',
      toolAssemblyNumber: 'TA-001', toolAssemblyName: 'Face mill', toolAssemblyDescription: 'Use for aluminum', toolNumber: 'T01', sequenceNumber: 10, notes: 'Default',
    }]
    const copied = copyRoutingTooling(defaults, 'work-order-op')
    copied[0].toolNumber = 'T12'
    defaults[0].notes = 'Routing changed later'
    expect(defaults[0].toolNumber).toBe('T01')
    expect(copied[0]).toMatchObject({ workOrderOperationId: 'work-order-op', sourceRoutingOperationToolId: 'routing-tool', toolAssemblyDescription: 'Use for aluminum', notes: 'Default' })
  })

  it('keeps archived assemblies visible only when already selected', () => {
    const values = [assembly('active'), assembly('archived', '2026-08-01T00:00:00Z')]
    expect(selectableToolAssemblies(values).map((tool) => tool.id)).toEqual(['active'])
    expect(selectableToolAssemblies(values, new Set(['archived'])).map((tool) => tool.id)).toEqual(['active', 'archived'])
  })

  it('treats the same assembly on multiple unstarted operations as informational future requirements', () => {
    const workOrders = [workOrder('wo-1', 'op-1'), workOrder('wo-2', 'op-2')]
    expect(deriveToolUsage(workOrders, []).get('assembly')).toEqual({ active: 0, future: 2 })
  })

  it('counts simultaneous active operation usage and exposes the unique-assembly conflict condition', () => {
    const workOrders = [workOrder('wo-1', 'op-1'), workOrder('wo-2', 'op-2')]
    const events = [release('wo-1', 'op-1', 2, '1'), transfer('wo-1', 'op-1', 1, '2'), release('wo-2', 'op-2', 2, '3'), transfer('wo-2', 'op-2', 1, '4')]
    const active = deriveToolUsage(workOrders, events).get('assembly')?.active ?? 0
    expect(active).toBe(2)
    expect(active > 1).toBe(true)
  })

  it('releases tooling usage automatically when an operation completes', () => {
    const workOrders = [workOrder('wo-1', 'op-1')]
    const activeEvents = [release('wo-1', 'op-1', 2, '1'), transfer('wo-1', 'op-1', 1, '2')]
    const completeEvents = [...activeEvents, transfer('wo-1', 'op-1', 1, '3')]
    expect(deriveToolUsage(workOrders, activeEvents).get('assembly')).toEqual({ active: 1, future: 0 })
    expect(deriveToolUsage(workOrders, completeEvents).get('assembly')).toBeUndefined()
  })
})

function workOrder(id: string, operationId: string): WorkOrder {
  return {
    id, organizationId: 'org', workOrderNumber: id, workOrderName: id, salesOrderId: 'so', salesOrderLineItemId: 'line',
    partNumber: 'PART', quantityOrdered: 2, dueDate: '2026-09-01', releasedAt: '2026-08-29T00:00:00Z', completionDate: null,
    archivedAt: null, notes: '', routing: [{ id: operationId, workOrderId: id, sequenceNumber: 10, routingStepName: 'Mill', customerStageName: 'In production', workInstructions: '', notes: '' }],
    operationTooling: [{ id: `${id}-tool`, workOrderOperationId: operationId, toolAssemblyId: 'assembly', toolAssemblyNumber: 'TA-001', toolAssemblyName: 'Face mill', toolAssemblyDescription: 'Use for aluminum', toolNumber: 'T01', sequenceNumber: 10, notes: '', sourceRoutingOperationToolId: 'routing-tool' }],
  }
}

function release(workOrderId: string, operationId: string, quantity: number, id: string): ProductionEvent {
  return { id, organizationId: 'org', workOrderId, routingStepId: operationId, eventType: 'release', quantity, fromRoutingStepId: null, toRoutingStepId: operationId, reversedEventId: null, actorId: 'user', requestId: id, createdAt: `2026-08-29T00:00:0${id}Z` }
}

function transfer(workOrderId: string, operationId: string, quantity: number, id: string): ProductionEvent {
  return { id, organizationId: 'org', workOrderId, routingStepId: operationId, eventType: 'transfer', quantity, fromRoutingStepId: operationId, toRoutingStepId: null, reversedEventId: null, actorId: 'user', requestId: id, createdAt: `2026-08-29T00:00:0${id}Z` }
}
