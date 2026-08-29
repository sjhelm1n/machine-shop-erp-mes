import { calculateStepMetrics } from './routing'
import type { ProductionEvent, ProductionToolCheckoutRequirement, RoutingOperationTool, ToolAssembly, ToolCheckoutTransaction, WorkOrder, WorkOrderOperationTool } from './types'

export interface ToolingDraft {
  key: string
  toolAssemblyId: string
  toolNumber: string
  notes: string
  sourceRoutingOperationToolId?: string | null
}

export const toolNumberPattern = /^T\d{1,4}$/

export function normalizeToolNumber(value: string): string {
  return value.trim().toUpperCase()
}

export function validateToolingDraft(rows: readonly ToolingDraft[]): string | null {
  const positions = new Set<string>()
  for (const row of rows) {
    const toolNumber = normalizeToolNumber(row.toolNumber)
    if (!row.toolAssemblyId) return 'Select a tool assembly for every tooling row.'
    if (!toolNumberPattern.test(toolNumber)) return 'Tool numbers must use CNC notation such as T01, T1, or T12.'
    if (positions.has(toolNumber)) return `Tool number ${toolNumber} is used more than once in this operation.`
    positions.add(toolNumber)
  }
  return null
}

export function checkedOutQuantity(transactions: readonly ToolCheckoutTransaction[], toolAssemblyId: string): number {
  // Shop data loads append-only checkout events newest first by database sequence.
  const latest = transactions.find((transaction) => transaction.toolAssemblyId === toolAssemblyId)
  return latest?.transactionType === 'CHECK_OUT' ? 1 : 0
}

export function validateCheckoutTransaction(
  quantityCheckedOut: number,
  transactionType: 'CHECK_OUT' | 'CHECK_IN',
  quantityInUse = 0,
): string | null {
  if (transactionType === 'CHECK_OUT' && quantityCheckedOut > 0) return 'Tool assembly is already checked out.'
  if (transactionType === 'CHECK_IN' && quantityCheckedOut === 0) return 'Tool assembly is not checked out.'
  if (transactionType === 'CHECK_IN' && quantityInUse > 0) return 'Tool assembly cannot be checked in while it is in use.'
  return null
}

export function operationCheckoutError(
  workOrder: WorkOrder,
  routingStepId: string,
  toolAssemblies: readonly ToolAssembly[],
): string | null {
  const assembliesById = new Map(toolAssemblies.map((assembly) => [assembly.id, assembly]))
  const uncheckedAssignment = (workOrder.operationTooling ?? [])
    .filter((assignment) => assignment.workOrderOperationId === routingStepId)
    .find((assignment) => (assembliesById.get(assignment.toolAssemblyId)?.quantityCheckedOut ?? 0) === 0)
  if (!uncheckedAssignment) return null
  const unchecked = assembliesById.get(uncheckedAssignment.toolAssemblyId)
  if (!unchecked) return `${uncheckedAssignment.toolAssemblyNumber} must be checked out before production can be recorded for this operation.`
  return `${unchecked.assemblyNumber} · ${unchecked.name} must be checked out before production can be recorded for this operation.`
}

export function productionToolCheckoutRequirements(
  workOrder: WorkOrder,
  routingStepId: string,
  toolAssemblies: readonly ToolAssembly[],
): ProductionToolCheckoutRequirement[] {
  const currentStep = workOrder.routing.find((step) => step.id === routingStepId)
  if (!currentStep) return []
  const nextStep = [...workOrder.routing]
    .filter((step) => step.sequenceNumber > currentStep.sequenceNumber)
    .sort((left, right) => left.sequenceNumber - right.sequenceNumber)[0]
  const targetSteps = [{ operationRole: 'current' as const, step: currentStep }, ...(nextStep ? [{ operationRole: 'next' as const, step: nextStep }] : [])]
  const assembliesById = new Map(toolAssemblies.map((assembly) => [assembly.id, assembly]))
  return targetSteps.flatMap(({ operationRole, step }) => (workOrder.operationTooling ?? [])
    .filter((assignment) => assignment.workOrderOperationId === step.id)
    .sort((left, right) => left.sequenceNumber - right.sequenceNumber || left.toolNumber.localeCompare(right.toolNumber))
    .map((assignment) => {
      const assembly = assembliesById.get(assignment.toolAssemblyId)
      return {
        operationRole,
        routingStepId: step.id,
        sequenceNumber: step.sequenceNumber,
        routingStepName: step.routingStepName,
        toolAssemblyId: assignment.toolAssemblyId,
        assemblyNumber: assembly?.assemblyNumber ?? assignment.toolAssemblyNumber,
        toolName: assembly?.name ?? assignment.toolAssemblyName,
        toolDescription: assembly?.description ?? assignment.toolAssemblyDescription,
        checkedOut: (assembly?.quantityCheckedOut ?? 0) > 0,
      }
    }))
}

export interface ToolUsageTotals {
  active: number
  future: number
}

export function deriveToolUsage(workOrders: readonly WorkOrder[], productionEvents: readonly ProductionEvent[]): Map<string, ToolUsageTotals> {
  const usage = new Map<string, ToolUsageTotals>()
  for (const workOrder of workOrders) {
    if (workOrder.archivedAt || workOrder.completionDate) continue
    const metrics = calculateStepMetrics(workOrder, [...productionEvents])
    for (const assignment of workOrder.operationTooling ?? []) {
      const metric = metrics.find((candidate) => candidate.stepId === assignment.workOrderOperationId)
      if (!metric || metric.completedAt) continue
      const value = usage.get(assignment.toolAssemblyId) ?? { active: 0, future: 0 }
      if (metric.startedAt) value.active += 1
      else value.future += 1
      usage.set(assignment.toolAssemblyId, value)
    }
  }
  return usage
}

export function copyRoutingTooling(
  tooling: readonly RoutingOperationTool[] = [],
  workOrderOperationId: string,
): WorkOrderOperationTool[] {
  return tooling.map((assignment, index) => ({
    id: crypto.randomUUID(),
    workOrderOperationId,
    toolAssemblyId: assignment.toolAssemblyId,
    toolAssemblyNumber: assignment.toolAssemblyNumber,
    toolAssemblyName: assignment.toolAssemblyName,
    toolAssemblyDescription: assignment.toolAssemblyDescription,
    toolNumber: assignment.toolNumber,
    sequenceNumber: (index + 1) * 10,
    notes: assignment.notes,
    sourceRoutingOperationToolId: assignment.id,
  }))
}

export function selectableToolAssemblies(
  assemblies: readonly ToolAssembly[],
  selectedIds: ReadonlySet<string> = new Set(),
): ToolAssembly[] {
  return assemblies.filter((assembly) => !assembly.archivedAt || selectedIds.has(assembly.id))
}
