import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../lib/supabase', () => ({
  requireSupabase: () => ({ rpc }),
}))

import { loadDashboardMetrics, markSalesOrderMilestone } from './shopService'

describe('markSalesOrderMilestone', () => {
  beforeEach(() => rpc.mockReset())

  it('returns the authoritative server timestamp for a targeted context update', async () => {
    rpc.mockResolvedValue({ data: '2026-08-29T00:30:00.000Z', error: null })

    await expect(markSalesOrderMilestone('sales-order-id', 'invoiced'))
      .resolves.toBe('2026-08-29T00:30:00.000Z')
    expect(rpc).toHaveBeenCalledWith('mark_sales_order_milestone', {
      p_sales_order_id: 'sales-order-id',
      p_milestone: 'invoiced',
    })
  })

  it('rejects a successful response that omits the confirmation timestamp', async () => {
    rpc.mockResolvedValue({ data: null, error: null })

    await expect(markSalesOrderMilestone('sales-order-id', 'shipped'))
      .rejects.toThrow('without a confirmation timestamp')
  })

  it('requests daily dashboard scrap totals regardless of the selected period', async () => {
    rpc.mockResolvedValue({
      data: {
        revenueByCustomer: [],
        onTimeDelivery: { onTime: 0, late: 0 },
        productionRevenue: [],
        scrapOverTime: [],
        idleWorkOrders: [],
        leadTimes: [],
      },
      error: null,
    })

    await loadDashboardMetrics({ startDate: null, endDate: null })

    expect(rpc).toHaveBeenCalledWith('dashboard_metrics', { p_bucket: 'day' })
  })
})
