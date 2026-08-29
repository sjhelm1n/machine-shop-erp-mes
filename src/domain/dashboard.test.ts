import { describe, expect, it } from 'vitest'
import { demoData } from '../data/demoData'
import { buildDemoDashboardMetrics, buildDemoProductionCompleteOpenOrders, parseDashboardMetrics, parseProductionCompleteOpenOrders } from './dashboard'

describe('dashboard metrics', () => {
  it('uses date-aware domain rules for revenue, delivery, scrap, idle work, and lead time', () => {
    const metrics = buildDemoDashboardMetrics(
      structuredClone(demoData),
      { startDate: null, endDate: null },
      new Date('2026-08-28T16:00:00Z'),
    )

    expect(metrics.revenueByCustomer).toEqual([
      { customerId: '20000000-0000-0000-0000-000000000001', customerName: 'Acme Motion Systems', revenue: 6612 },
      { customerId: '20000000-0000-0000-0000-000000000002', customerName: 'Northstar Robotics', revenue: 3264 },
    ])
    expect(metrics.onTimeDelivery).toEqual({ onTime: 0, late: 1 })
    expect(metrics.productionRevenue.map((row) => row.revenue)).toEqual([4250, 3264])
    expect(metrics.scrapOverTime).toEqual([{ date: '2026-08-22', quantity: 1 }])
    expect(metrics.idleWorkOrders).toHaveLength(2)
    expect(metrics.leadTimes[0]).toMatchObject({ workOrderName: '260796', leadTimeDays: 22 })
  })

  it('rejects malformed reporting data at the database boundary', () => {
    expect(() => parseDashboardMetrics({ revenueByCustomer: [] })).toThrow('Dashboard on-time delivery returned an invalid record.')
  })

  it('groups scrap on each event recorded date in the plant timezone', () => {
    const data = structuredClone(demoData)
    const scrap = data.productionEvents.find((event) => event.eventType === 'scrap')!
    data.productionEvents.push({ ...scrap, id: 'scrap-next-day', quantity: 2, createdAt: '2026-08-24T01:30:00Z' })

    const metrics = buildDemoDashboardMetrics(data, { startDate: null, endDate: null })

    expect(metrics.scrapOverTime).toEqual([
      { date: '2026-08-22', quantity: 1 },
      { date: '2026-08-23', quantity: 2 },
    ])
  })

  it('lists open sales orders only when every active work order is complete', () => {
    const data = structuredClone(demoData)
    const order = data.salesOrders.find((candidate) => candidate.id === 'so-1048')!
    const workOrder = data.workOrders.find((candidate) => candidate.salesOrderId === order.id)!
    workOrder.completionDate = '2026-08-27'

    expect(buildDemoProductionCompleteOpenOrders(data)).toEqual([{
      salesOrderId: order.id,
      salesOrderName: order.salesOrderName,
      customerName: order.customerName,
      customerPoNumber: order.customerPoNumber,
      orderDueDate: order.orderDueDate,
      productionCompletedAt: '2026-08-27',
      shippedAt: null,
      invoicedAt: null,
    }])
  })

  it('parses production-complete sales orders at the database boundary', () => {
    expect(parseProductionCompleteOpenOrders([{
      sales_order_id: 'order-1',
      sales_order_name: '1048',
      customer_name: 'Acme',
      customer_po_number: 'PO-1',
      order_due_date: '2026-08-28',
      production_completed_at: '2026-08-27',
      shipped_at: null,
      invoiced_at: '2026-08-28T12:00:00Z',
    }])).toMatchObject([{ salesOrderId: 'order-1', shippedAt: null }])
  })
})
