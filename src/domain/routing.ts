import type { ProductionEvent, RoutingStep, SalesOrder, WorkOrder } from './types'

export interface StepMetrics {
  stepId: string
  entered: number
  transferred: number
  scrapped: number
  available: number
  processed: number
  enteredAt: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface WorkOrderStageBreakdown {
  stageName: string
  quantity: number
  percentage: number
}

export function activeProductionEvents(events: ProductionEvent[]): ProductionEvent[] {
  const reversedIds = new Set(
    events.filter((event) => event.eventType === 'reversal' && event.reversedEventId).map((event) => event.reversedEventId),
  )
  return events.filter((event) => event.eventType !== 'reversal' && !reversedIds.has(event.id))
}

export function calculateStepMetrics(workOrder: WorkOrder, events: ProductionEvent[]): StepMetrics[] {
  const orderedSteps = [...workOrder.routing].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
  const active = activeProductionEvents(events.filter((event) => event.workOrderId === workOrder.id))

  const base = orderedSteps.map((step, index) => {
    const inbound = active.filter(
      (event) =>
        (event.eventType === 'release' || event.eventType === 'adjustment') && event.routingStepId === step.id ||
        event.eventType === 'transfer' && event.toRoutingStepId === step.id,
    )
    const outbound = active.filter(
      (event) => event.eventType === 'transfer' && event.fromRoutingStepId === step.id,
    )
    const scraps = active.filter((event) => event.eventType === 'scrap' && event.routingStepId === step.id)
    const entered = inbound.reduce((sum, event) => sum + event.quantity, 0)
    const transferred = outbound.reduce((sum, event) => sum + event.quantity, 0)
    const scrapped = scraps.reduce((sum, event) => sum + event.quantity, 0)
    const activity = [...outbound, ...scraps].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const enteredEvents = inbound.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    return {
      stepId: step.id,
      entered,
      transferred,
      scrapped,
      available: Math.max(0, entered - transferred - scrapped),
      processed: transferred + scrapped,
      enteredAt: enteredEvents[0]?.createdAt ?? (index === 0 ? workOrder.releasedAt : null),
      startedAt: activity[0]?.createdAt ?? null,
      completedAt: null,
    } satisfies StepMetrics
  })

  return base.map((metric, index) => {
    const upstreamEmpty = base.slice(0, index).every((candidate) => candidate.available === 0)
    const hasEntered = metric.entered > 0
    if (hasEntered && metric.available === 0 && upstreamEmpty && metric.startedAt) {
      const relevant = active
        .filter(
          (event) =>
            event.routingStepId === metric.stepId ||
            event.fromRoutingStepId === metric.stepId ||
            event.toRoutingStepId === metric.stepId,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return { ...metric, completedAt: relevant[0]?.createdAt ?? null }
    }
    return metric
  })
}

export function workOrderProgress(workOrder: WorkOrder, events: ProductionEvent[]): number {
  if (workOrder.customerProgressPercent !== undefined) {
    return Math.max(0, Math.min(100, Math.round(workOrder.customerProgressPercent)))
  }
  if (workOrder.routing.length === 0 || workOrder.quantityOrdered <= 0) return 0
  const processed = calculateStepMetrics(workOrder, events).reduce(
    (sum, step) => sum + Math.min(step.processed, workOrder.quantityOrdered),
    0,
  )
  return Math.min(100, Math.round((processed / (workOrder.quantityOrdered * workOrder.routing.length)) * 100))
}

export function workOrderStageBreakdown(
  workOrder: WorkOrder,
  events: ProductionEvent[],
): WorkOrderStageBreakdown[] {
  if (workOrder.quantityOrdered <= 0) return []

  const orderedSteps = [...workOrder.routing].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
  const metrics = calculateStepMetrics(workOrder, events)
  const stageQuantities = new Map<string, { stageName: string; quantity: number }>()

  const addStageQuantity = (stageName: string, quantity: number) => {
    const displayName = stageName.trim() || 'In production'
    const key = displayName.toLocaleLowerCase()
    const current = stageQuantities.get(key)
    stageQuantities.set(key, {
      stageName: current?.stageName ?? displayName,
      quantity: (current?.quantity ?? 0) + quantity,
    })
  }

  orderedSteps.forEach((step, index) => {
    addStageQuantity(step.customerStageName, metrics[index]?.available ?? 0)
  })

  const completedQuantity = metrics.at(-1)?.transferred ?? 0
  addStageQuantity('Complete', completedQuantity)

  const scrappedQuantity = metrics.reduce((sum, metric) => sum + metric.scrapped, 0)
  const accountedQuantity = metrics.reduce((sum, metric) => sum + metric.available, 0)
    + completedQuantity
    + scrappedQuantity
  const orderReceivedQuantity = Math.max(0, workOrder.quantityOrdered - accountedQuantity)
  const breakdown = orderReceivedQuantity > 0
    ? [{ stageName: 'Order received', quantity: orderReceivedQuantity }]
    : []

  breakdown.push(...stageQuantities.values())
  if (scrappedQuantity > 0) breakdown.push({ stageName: 'Scrapped', quantity: scrappedQuantity })

  return breakdown.map((stage) => ({
    ...stage,
    percentage: Math.round((stage.quantity / workOrder.quantityOrdered) * 100),
  }))
}

export function salesOrderProgress(
  workOrders: WorkOrder[],
  events: ProductionEvent[],
  salesOrderId: string,
): number {
  const related = workOrders.filter((workOrder) => workOrder.salesOrderId === salesOrderId && !workOrder.archivedAt)
  const totalWeight = related.reduce((sum, workOrder) => sum + workOrder.quantityOrdered, 0)
  if (totalWeight === 0) return 0
  const weighted = related.reduce(
    (sum, workOrder) => sum + workOrderProgress(workOrder, events) * workOrder.quantityOrdered,
    0,
  )
  return Math.min(100, Math.round(weighted / totalWeight))
}

export interface SalesOrderCompletion {
  productionCompleted: boolean
  shipped: boolean
  invoiced: boolean
  completed: boolean
}

export function salesOrderCompletion(
  order: Pick<SalesOrder, 'id' | 'shippedAt' | 'invoicedAt'>,
  workOrders: WorkOrder[],
  events: ProductionEvent[],
): SalesOrderCompletion {
  const productionCompleted = salesOrderProgress(workOrders, events, order.id) === 100
  const shipped = order.shippedAt !== null
  const invoiced = order.invoicedAt !== null
  return { productionCompleted, shipped, invoiced, completed: productionCompleted && shipped && invoiced }
}

export function isSalesOrderCompleted(
  order: Pick<SalesOrder, 'id' | 'shippedAt' | 'invoicedAt'>,
  workOrders: WorkOrder[],
  events: ProductionEvent[],
): boolean {
  return salesOrderCompletion(order, workOrders, events).completed
}

export function customerStage(workOrder: WorkOrder, events: ProductionEvent[]): string {
  if (workOrder.customerStageName) return workOrder.customerStageName
  const metrics = calculateStepMetrics(workOrder, events)
  const ordered = [...workOrder.routing].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
  if (metrics.length === 0 || metrics.every((metric) => metric.processed === 0)) return 'Order received'
  if (workOrder.completionDate) return 'Complete'
  const furthest = metrics.reduce((found, metric, index) => (metric.entered > 0 ? index : found), 0)
  return ordered[furthest]?.customerStageName ?? 'In production'
}

export function getNextStep(step: RoutingStep, routing: RoutingStep[]): RoutingStep | null {
  const ordered = [...routing].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
  const index = ordered.findIndex((candidate) => candidate.id === step.id)
  return index >= 0 ? ordered[index + 1] ?? null : null
}

export function canTransfer(quantity: number, available: number): boolean {
  return Number.isInteger(quantity) && quantity > 0 && quantity <= available
}
