import type { Customer, CustomerDocument, ProductionEvent, Question, SalesOrder, ShopData, WorkOrder } from './types'
import { isSalesOrderCompleted } from './routing'

export type CustomerOrderStatusFilter = 'all' | 'in_progress' | 'complete'

export interface CustomerPortalSnapshot {
  customer: Customer | undefined
  salesOrders: SalesOrder[]
  workOrders: WorkOrder[]
  productionEvents: ProductionEvent[]
  questions: Question[]
  documents: CustomerDocument[]
}

export function customerPortalSnapshot(data: ShopData, customerId: string): CustomerPortalSnapshot {
  const salesOrders = data.salesOrders
    .filter((order) => order.customerId === customerId)
    .map((order) => {
      const relatedWorkOrders = data.workOrders.filter((workOrder) => workOrder.salesOrderId === order.id)
      const customerCompleted = typeof order.customerCompleted === 'boolean'
        ? order.customerCompleted
        : order.shippedAt !== null
          && order.invoicedAt !== null
          && relatedWorkOrders.length > 0
          && relatedWorkOrders.every((workOrder) => workOrder.completionDate !== null)
      return { ...order, customerCompleted }
    })
  const salesOrderIds = new Set(salesOrders.map((order) => order.id))
  const workOrders = data.workOrders.filter((workOrder) => salesOrderIds.has(workOrder.salesOrderId) && !workOrder.archivedAt)
  const workOrderIds = new Set(workOrders.map((workOrder) => workOrder.id))

  return {
    customer: data.customers.find((customer) => customer.id === customerId),
    salesOrders,
    workOrders,
    productionEvents: data.productionEvents.filter((event) => workOrderIds.has(event.workOrderId)),
    questions: data.questions.filter((question) => question.customerId === customerId),
    documents: data.documents.filter((document) => document.customerId === customerId),
  }
}

export function filterCustomerPortalOrders(
  snapshot: CustomerPortalSnapshot,
  status: CustomerOrderStatusFilter,
  query: string,
): SalesOrder[] {
  const normalizedQuery = query.trim().toLowerCase()

  return snapshot.salesOrders.filter((order) => {
    const complete = isSalesOrderCompleted(order, snapshot.workOrders, snapshot.productionEvents)
    if (status === 'complete' && !complete) return false
    if (status === 'in_progress' && complete) return false
    if (!normalizedQuery) return true

    const workOrderParts = snapshot.workOrders
      .filter((workOrder) => workOrder.salesOrderId === order.id)
      .map((workOrder) => workOrder.partNumber)
    const lineTerms = order.lines.flatMap((line) => [line.partNumber ?? '', line.description])
    return [order.salesOrderName, order.customerPoNumber, ...workOrderParts, ...lineTerms]
      .some((value) => value.toLowerCase().includes(normalizedQuery))
  })
}
