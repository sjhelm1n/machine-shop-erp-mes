import type { Customer, CustomerDocument, ProductionEvent, Question, SalesOrder, ShopData, WorkOrder } from './types'

export interface CustomerPortalSnapshot {
  customer: Customer | undefined
  salesOrders: SalesOrder[]
  workOrders: WorkOrder[]
  productionEvents: ProductionEvent[]
  questions: Question[]
  documents: CustomerDocument[]
}

export function customerPortalSnapshot(data: ShopData, customerId: string): CustomerPortalSnapshot {
  const salesOrders = data.salesOrders.filter((order) => order.customerId === customerId)
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
