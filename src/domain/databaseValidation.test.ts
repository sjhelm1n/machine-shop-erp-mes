import { describe, expect, it } from 'vitest'
import { parseProductionEvent, parseProductionStepSnapshot, parseProductionToolCheckoutRequirement } from './databaseValidation'

describe('database contract validation', () => {
  it('maps a production event returned by the posting RPC', () => {
    expect(parseProductionEvent({
      id: 'event-1',
      organization_id: 'org-1',
      work_order_id: 'wo-1',
      routing_step_id: 'step-1',
      event_type: 'transfer',
      quantity: 2,
      from_routing_step_id: 'step-1',
      to_routing_step_id: 'step-2',
      reversed_event_id: null,
      actor_id: 'user-1',
      request_id: 'request-1',
      created_at: '2026-08-28T22:00:00Z',
    })).toMatchObject({ eventType: 'transfer', quantity: 2, actorId: 'user-1', requestId: 'request-1' })
  })

  it('fails closed when a production event enum or quantity drifts', () => {
    expect(() => parseProductionEvent({
      id: 'event-1', organization_id: 'org-1', work_order_id: 'wo-1', routing_step_id: 'step-1',
      event_type: 'moved', quantity: 1.5, from_routing_step_id: null, to_routing_step_id: null,
      reversed_event_id: null, actor_id: null, request_id: null, created_at: '2026-08-28T22:00:00Z',
    })).toThrow('event_type is unsupported')
  })

  it('maps the narrow production-step snapshot contract', () => {
    expect(parseProductionStepSnapshot({
      work_order_id: 'wo-1', work_order_name: '000001', part_number: 'PART-1', archived_at: null,
      step_id: 'step-1', sequence_number: 10, routing_step_name: 'Mill', available: 8,
      transferred: 2, scrapped: 0, next_step_id: 'step-2', next_step_name: 'Inspect',
    })).toEqual({
      workOrderId: 'wo-1', workOrderName: '000001', partNumber: 'PART-1', archivedAt: null,
      stepId: 'step-1', sequenceNumber: 10, routingStepName: 'Mill', available: 8,
      transferred: 2, scrapped: 0, nextStepId: 'step-2', nextStepName: 'Inspect',
      toolCheckoutRequirements: [],
    })
  })

  it('maps destination Tool Assembly checkout requirements for the operator screen', () => {
    expect(parseProductionToolCheckoutRequirement({
      operation_role: 'next', routing_step_id: 'step-2', sequence_number: 20, routing_step_name: 'Mill',
      tool_assembly_id: 'tool-1', assembly_number: 'TA-001', tool_name: 'Face mill',
      tool_description: 'Balanced assembly', checked_out: false,
    })).toEqual({
      operationRole: 'next', routingStepId: 'step-2', sequenceNumber: 20, routingStepName: 'Mill',
      toolAssemblyId: 'tool-1', assemblyNumber: 'TA-001', toolName: 'Face mill',
      toolDescription: 'Balanced assembly', checkedOut: false,
    })
  })
})
