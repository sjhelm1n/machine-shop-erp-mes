import type { ShopData } from './types'
import { calendarDateInTimeZone, calendarDaysBetween } from '../lib/format'

export interface DashboardRange {
  startDate: string | null
  endDate: string | null
}

export interface DashboardMetrics {
  revenueByCustomer: Array<{ customerId: string; customerName: string; revenue: number }>
  onTimeDelivery: { onTime: number; late: number }
  productionRevenue: Array<{ workOrderId: string; workOrderName: string; partNumber: string; customerName: string; revenue: number }>
  scrapOverTime: Array<{ date: string; quantity: number }>
  idleWorkOrders: Array<{ workOrderId: string; workOrderName: string; partNumber: string; customerName: string; lastActivityAt: string; idleHours: number }>
  leadTimes: Array<{ workOrderId: string; workOrderName: string; partNumber: string; customerName: string; enteredDate: string; completionDate: string; leadTimeDays: number }>
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} returned an invalid record.`)
  return value as Record<string, unknown>
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Dashboard field ${field} must be an array.`)
  return value
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Dashboard field ${field} must be a non-empty string.`)
  return value
}

function number(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Dashboard field ${field} must be a finite number.`)
  return value
}

export function parseDashboardMetrics(value: unknown): DashboardMetrics {
  const result = record(value, 'Dashboard metrics RPC')
  const delivery = record(result.onTimeDelivery, 'Dashboard on-time delivery')
  return {
    revenueByCustomer: array(result.revenueByCustomer, 'revenueByCustomer').map((value) => {
      const row = record(value, 'Dashboard customer revenue')
      return { customerId: string(row.customerId, 'customerId'), customerName: string(row.customerName, 'customerName'), revenue: number(row.revenue, 'revenue') }
    }),
    onTimeDelivery: { onTime: number(delivery.onTime, 'onTime'), late: number(delivery.late, 'late') },
    productionRevenue: array(result.productionRevenue, 'productionRevenue').map((value) => {
      const row = record(value, 'Dashboard production revenue')
      return { workOrderId: string(row.workOrderId, 'workOrderId'), workOrderName: string(row.workOrderName, 'workOrderName'), partNumber: string(row.partNumber, 'partNumber'), customerName: string(row.customerName, 'customerName'), revenue: number(row.revenue, 'revenue') }
    }),
    scrapOverTime: array(result.scrapOverTime, 'scrapOverTime').map((value) => {
      const row = record(value, 'Dashboard scrap')
      return { date: string(row.date, 'date'), quantity: number(row.quantity, 'quantity') }
    }),
    idleWorkOrders: array(result.idleWorkOrders, 'idleWorkOrders').map((value) => {
      const row = record(value, 'Dashboard idle work order')
      return { workOrderId: string(row.workOrderId, 'workOrderId'), workOrderName: string(row.workOrderName, 'workOrderName'), partNumber: string(row.partNumber, 'partNumber'), customerName: string(row.customerName, 'customerName'), lastActivityAt: string(row.lastActivityAt, 'lastActivityAt'), idleHours: number(row.idleHours, 'idleHours') }
    }),
    leadTimes: array(result.leadTimes, 'leadTimes').map((value) => {
      const row = record(value, 'Dashboard lead time')
      return { workOrderId: string(row.workOrderId, 'workOrderId'), workOrderName: string(row.workOrderName, 'workOrderName'), partNumber: string(row.partNumber, 'partNumber'), customerName: string(row.customerName, 'customerName'), enteredDate: string(row.enteredDate, 'enteredDate'), completionDate: string(row.completionDate, 'completionDate'), leadTimeDays: number(row.leadTimeDays, 'leadTimeDays') }
    }),
  }
}

function inRange(value: string, range: DashboardRange): boolean {
  return (!range.startDate || value >= range.startDate) && (!range.endDate || value <= range.endDate)
}

export function buildDemoDashboardMetrics(data: ShopData, range: DashboardRange, now = new Date()): DashboardMetrics {
  const customerRevenue = new Map<string, { customerId: string; customerName: string; revenue: number }>()
  const salesOrderById = new Map(data.salesOrders.map((order) => [order.id, order]))
  const workOrdersByLine = new Map<string, typeof data.workOrders>()
  const activeLineById = new Map(data.salesOrders.flatMap((order) => order.lines.filter((line) => !line.archivedAt).map((line) => [line.id, line] as const)))

  for (const order of data.salesOrders) {
    if (!inRange(order.dateReceived, range)) continue
    const revenue = order.lines.reduce((total, line) => total + (line.archivedAt ? 0 : line.lineTotal), 0)
    const current = customerRevenue.get(order.customerId)
    if (current) current.revenue += revenue
    else customerRevenue.set(order.customerId, { customerId: order.customerId, customerName: order.customerName, revenue })
  }

  for (const workOrder of data.workOrders) {
    if (workOrder.archivedAt) continue
    const related = workOrdersByLine.get(workOrder.salesOrderLineItemId)
    if (related) related.push(workOrder)
    else workOrdersByLine.set(workOrder.salesOrderLineItemId, [workOrder])
  }

  let onTime = 0
  let late = 0
  for (const order of data.salesOrders) {
    if (!order.shippedAt) continue
    const shippedDate = calendarDateInTimeZone(data.organization.plantTimezone, new Date(order.shippedAt))
    if (!inRange(shippedDate, range)) continue
    if (shippedDate < order.orderDueDate) onTime += 1
    else late += 1
  }

  const productionRevenue = data.workOrders.flatMap((workOrder) => {
    const order = salesOrderById.get(workOrder.salesOrderId)
    const line = activeLineById.get(workOrder.salesOrderLineItemId)
    if (!order || !line || order.archivedAt || workOrder.archivedAt || workOrder.completionDate || !inRange(order.dateReceived, range)) return []
    const totalQuantity = (workOrdersByLine.get(line.id) ?? []).reduce((total, candidate) => total + candidate.quantityOrdered, 0)
    return [{ workOrderId: workOrder.id, workOrderName: workOrder.workOrderName, partNumber: workOrder.partNumber, customerName: order.customerName, revenue: totalQuantity ? Math.round((line.lineTotal * workOrder.quantityOrdered / totalQuantity) * 100) / 100 : 0 }]
  }).sort((a, b) => b.revenue - a.revenue || a.workOrderName.localeCompare(b.workOrderName)).slice(0, 20)

  const reversedEventIds = new Set(data.productionEvents.flatMap((event) => event.reversedEventId ? [event.reversedEventId] : []))
  const scrapByDate = new Map<string, number>()
  for (const event of data.productionEvents) {
    if (event.eventType !== 'scrap' || reversedEventIds.has(event.id)) continue
    const eventDate = calendarDateInTimeZone(data.organization.plantTimezone, new Date(event.createdAt))
    if (!inRange(eventDate, range)) continue
    scrapByDate.set(eventDate, (scrapByDate.get(eventDate) ?? 0) + event.quantity)
  }

  const lastActivityByWorkOrder = new Map(data.workOrders.map((workOrder) => [workOrder.id, workOrder.releasedAt]))
  for (const event of data.productionEvents) {
    const current = lastActivityByWorkOrder.get(event.workOrderId)
    if (!current || event.createdAt > current) lastActivityByWorkOrder.set(event.workOrderId, event.createdAt)
  }
  const nowMs = now.getTime()
  const idleWorkOrders = data.workOrders.flatMap((workOrder) => {
    if (workOrder.archivedAt || workOrder.completionDate) return []
    const lastActivityAt = lastActivityByWorkOrder.get(workOrder.id) ?? workOrder.releasedAt
    const idleHours = Math.floor((nowMs - new Date(lastActivityAt).getTime()) / 3_600_000)
    if (idleHours < 24) return []
    return [{ workOrderId: workOrder.id, workOrderName: workOrder.workOrderName, partNumber: workOrder.partNumber, customerName: salesOrderById.get(workOrder.salesOrderId)?.customerName ?? 'Unknown customer', lastActivityAt, idleHours }]
  }).sort((a, b) => a.lastActivityAt.localeCompare(b.lastActivityAt) || a.workOrderName.localeCompare(b.workOrderName)).slice(0, 50)

  const leadTimes = data.workOrders.flatMap((workOrder) => {
    if (!workOrder.completionDate || !inRange(workOrder.completionDate, range)) return []
    const enteredDate = calendarDateInTimeZone(data.organization.plantTimezone, new Date(workOrder.releasedAt))
    return [{ workOrderId: workOrder.id, workOrderName: workOrder.workOrderName, partNumber: workOrder.partNumber, customerName: salesOrderById.get(workOrder.salesOrderId)?.customerName ?? 'Unknown customer', enteredDate, completionDate: workOrder.completionDate, leadTimeDays: Math.max(0, calendarDaysBetween(enteredDate, workOrder.completionDate)) }]
  }).sort((a, b) => b.completionDate.localeCompare(a.completionDate) || a.workOrderName.localeCompare(b.workOrderName)).slice(0, 50)

  return {
    revenueByCustomer: [...customerRevenue.values()].sort((a, b) => b.revenue - a.revenue || a.customerName.localeCompare(b.customerName)),
    onTimeDelivery: { onTime, late },
    productionRevenue,
    scrapOverTime: [...scrapByDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, quantity]) => ({ date, quantity })),
    idleWorkOrders,
    leadTimes,
  }
}
