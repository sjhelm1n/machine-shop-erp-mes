import { describe, expect, it } from 'vitest'
import { demoData } from '../data/demoData'
import { buildDemoDashboardMetrics, parseDashboardMetrics } from './dashboard'

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
})
