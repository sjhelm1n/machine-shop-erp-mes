import { describe, expect, it } from 'vitest'
import { demoData } from '../data/demoData'
import { customerPortalSnapshot } from './customerPortal'

describe('customerPortalSnapshot', () => {
  it('includes only records belonging to the selected customer', () => {
    const customer = demoData.customers.find((candidate) => candidate.customerName === 'Acme Motion Systems')!
    const snapshot = customerPortalSnapshot(demoData, customer.id)
    const orderIds = new Set(snapshot.salesOrders.map((order) => order.id))
    const workOrderIds = new Set(snapshot.workOrders.map((workOrder) => workOrder.id))

    expect(snapshot.customer?.id).toBe(customer.id)
    expect(snapshot.salesOrders.every((order) => order.customerId === customer.id)).toBe(true)
    expect(snapshot.workOrders.every((workOrder) => orderIds.has(workOrder.salesOrderId))).toBe(true)
    expect(snapshot.workOrders.every((workOrder) => !workOrder.archivedAt)).toBe(true)
    expect(snapshot.productionEvents.every((event) => workOrderIds.has(event.workOrderId))).toBe(true)
    expect(snapshot.questions.every((question) => question.customerId === customer.id)).toBe(true)
    expect(snapshot.documents.every((document) => document.customerId === customer.id)).toBe(true)
  })

  it('returns an empty customer view for an unknown customer', () => {
    const snapshot = customerPortalSnapshot(demoData, 'unknown-customer')

    expect(snapshot.customer).toBeUndefined()
    expect(snapshot.salesOrders).toEqual([])
    expect(snapshot.workOrders).toEqual([])
    expect(snapshot.productionEvents).toEqual([])
    expect(snapshot.questions).toEqual([])
    expect(snapshot.documents).toEqual([])
  })
})
