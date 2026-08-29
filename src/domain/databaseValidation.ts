import type { ProductionEvent, ProductionEventType, ProductionStepSnapshot, ProductionToolCheckoutRequirement } from './types'

function record(value: unknown, contract: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${contract} returned an invalid record.`)
  return value as Record<string, unknown>
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Database contract field ${field} must be a non-empty string.`)
  return value
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null
  return string(value, field)
}

function integer(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`Database contract field ${field} must be an integer.`)
  return value
}

const productionEventTypes = new Set<ProductionEventType>(['release', 'adjustment', 'transfer', 'scrap', 'reversal'])

export function parseProductionEvent(value: unknown): ProductionEvent {
  const row = record(value, 'Production event RPC')
  const eventType = string(row.event_type, 'event_type') as ProductionEventType
  if (!productionEventTypes.has(eventType)) throw new Error('Database contract field event_type is unsupported.')
  return {
    id: string(row.id, 'id'),
    organizationId: string(row.organization_id, 'organization_id'),
    workOrderId: string(row.work_order_id, 'work_order_id'),
    routingStepId: string(row.routing_step_id, 'routing_step_id'),
    eventType,
    quantity: integer(row.quantity, 'quantity'),
    fromRoutingStepId: nullableString(row.from_routing_step_id, 'from_routing_step_id'),
    toRoutingStepId: nullableString(row.to_routing_step_id, 'to_routing_step_id'),
    reversedEventId: nullableString(row.reversed_event_id, 'reversed_event_id'),
    actorId: nullableString(row.actor_id, 'actor_id'),
    requestId: nullableString(row.request_id, 'request_id'),
    createdAt: string(row.created_at, 'created_at'),
  }
}

export function parseProductionStepSnapshot(value: unknown): ProductionStepSnapshot {
  const row = record(value, 'Production step snapshot RPC')
  return {
    workOrderId: string(row.work_order_id, 'work_order_id'),
    workOrderName: string(row.work_order_name, 'work_order_name'),
    partNumber: string(row.part_number, 'part_number'),
    archivedAt: nullableString(row.archived_at, 'archived_at'),
    stepId: string(row.step_id, 'step_id'),
    sequenceNumber: integer(row.sequence_number, 'sequence_number'),
    routingStepName: string(row.routing_step_name, 'routing_step_name'),
    available: integer(row.available, 'available'),
    transferred: integer(row.transferred, 'transferred'),
    scrapped: integer(row.scrapped, 'scrapped'),
    nextStepId: nullableString(row.next_step_id, 'next_step_id'),
    nextStepName: nullableString(row.next_step_name, 'next_step_name'),
    toolCheckoutRequirements: [],
  }
}

export function parseProductionToolCheckoutRequirement(value: unknown): ProductionToolCheckoutRequirement {
  const row = record(value, 'Production tooling requirement RPC')
  const operationRole = string(row.operation_role, 'operation_role')
  if (operationRole !== 'current' && operationRole !== 'next') throw new Error('Database contract field operation_role is unsupported.')
  if (typeof row.checked_out !== 'boolean') throw new Error('Database contract field checked_out must be a boolean.')
  return {
    operationRole,
    routingStepId: string(row.routing_step_id, 'routing_step_id'),
    sequenceNumber: integer(row.sequence_number, 'sequence_number'),
    routingStepName: string(row.routing_step_name, 'routing_step_name'),
    toolAssemblyId: string(row.tool_assembly_id, 'tool_assembly_id'),
    assemblyNumber: string(row.assembly_number, 'assembly_number'),
    toolName: string(row.tool_name, 'tool_name'),
    toolDescription: typeof row.tool_description === 'string' ? row.tool_description : '',
    checkedOut: row.checked_out,
  }
}
