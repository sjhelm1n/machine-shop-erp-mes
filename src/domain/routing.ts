import type { ProductionEvent, RoutingStep, SalesOrder, StepMetrics, WorkOrder } from './types'

export type { StepMetrics } from './types'

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
  if (workOrder.stepMetrics) {
    const metricsByStep = new Map(workOrder.stepMetrics.map((metric) => [metric.stepId, metric]))
    return orderedSteps.flatMap((step) => {
      const metric = metricsByStep.get(step.id)
      return metric ? [metric] : []
    })
  }
  const active = activeProductionEvents(events.filter((event) => event.workOrderId === workOrder.id))

  const lastActivityByStep = new Map<string, string>()
  const base: StepMetrics[] = orderedSteps.map((step, index) => ({
    stepId: step.id,
    entered: 0,
    transferred: 0,
    scrapped: 0,
    available: 0,
    processed: 0,
    enteredAt: index === 0 ? workOrder.releasedAt : null,
    startedAt: null,
    completedAt: null,
  }))
  const metricsByStep = new Map(base.map((metric) => [metric.stepId, metric]))
  const earliest = (current: string | null, candidate: string) => !current || candidate < current ? candidate : current
  const latest = (current: string | undefined, candidate: string) => !current || candidate > current ? candidate : current

  for (const event of active) {
    if (event.eventType === 'release' || event.eventType === 'adjustment') {
      const metric = metricsByStep.get(event.routingStepId)
      if (metric) {
        metric.entered += event.quantity
        metric.enteredAt = earliest(metric.enteredAt, event.createdAt)
      }
    } else if (event.eventType === 'transfer') {
      const outbound = event.fromRoutingStepId ? metricsByStep.get(event.fromRoutingStepId) : undefined
      if (outbound) {
        outbound.transferred += event.quantity
        outbound.startedAt = earliest(outbound.startedAt, event.createdAt)
      }
      const inbound = event.toRoutingStepId ? metricsByStep.get(event.toRoutingStepId) : undefined
      if (inbound) {
        inbound.entered += event.quantity
        inbound.enteredAt = earliest(inbound.enteredAt, event.createdAt)
      }
    } else if (event.eventType === 'scrap') {
      const metric = metricsByStep.get(event.routingStepId)
      if (metric) {
        metric.scrapped += event.quantity
        metric.startedAt = earliest(metric.startedAt, event.createdAt)
      }
    }

    const relatedStepIds = new Set([event.routingStepId, event.fromRoutingStepId, event.toRoutingStepId])
    for (const stepId of relatedStepIds) {
      if (stepId && metricsByStep.has(stepId)) lastActivityByStep.set(stepId, latest(lastActivityByStep.get(stepId), event.createdAt))
    }
  }

  let upstreamEmpty = true
  for (const metric of base) {
    metric.available = Math.max(0, metric.entered - metric.transferred - metric.scrapped)
    metric.processed = metric.transferred + metric.scrapped
    if (metric.entered > 0 && metric.available === 0 && upstreamEmpty && metric.startedAt) {
      metric.completedAt = lastActivityByStep.get(metric.stepId) ?? null
    }
    upstreamEmpty = upstreamEmpty && metric.available === 0
  }
  return base
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
  order: Pick<SalesOrder, 'id' | 'shippedAt' | 'invoicedAt' | 'customerCompleted'>,
  workOrders: WorkOrder[],
  events: ProductionEvent[],
): boolean {
  if (typeof order.customerCompleted === 'boolean') return order.customerCompleted
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
