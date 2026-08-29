import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, storageFrom, storageUpload, storageRemove } = vi.hoisted(() => ({
  rpc: vi.fn(),
  storageFrom: vi.fn(),
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  requireSupabase: () => ({ rpc, storage: { from: storageFrom } }),
}))

import { createWorkOrder, loadDashboardMetrics, loadProductionCompleteOpenOrders, loadProductionStep, markSalesOrderMilestone, recordToolCheckout, removeToolAssemblyImage, saveRoutingTemplate, saveToolAssembly, saveWorkOrderOperationTools, setToolAssemblyArchived, uploadToolAssemblyImage } from './shopService'

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

  it('loads production-complete open sales orders through one bounded RPC', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })

    await loadProductionCompleteOpenOrders()

    expect(rpc).toHaveBeenCalledWith('dashboard_production_complete_open_orders')
  })
})

describe('production tooling checkout warning contract', () => {
  beforeEach(() => rpc.mockReset())

  it('loads unchecked destination tooling alongside the narrow production snapshot', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'production_step_snapshot') return { single: vi.fn().mockResolvedValue({ data: {
        work_order_id: 'wo-1', work_order_name: '000001', part_number: 'PART-1', archived_at: null,
        step_id: 'step-1', sequence_number: 10, routing_step_name: 'Mill', available: 5,
        transferred: 0, scrapped: 0, next_step_id: 'step-2', next_step_name: 'Inspect',
      }, error: null }) }
      return Promise.resolve({ data: [{
        operation_role: 'next', routing_step_id: 'step-2', sequence_number: 20, routing_step_name: 'Inspect',
        tool_assembly_id: 'tool-1', assembly_number: 'TA-001', tool_name: 'Inspection fixture',
        tool_description: '', checked_out: false,
      }], error: null })
    })

    await expect(loadProductionStep('wo-1', 'step-1')).resolves.toMatchObject({
      toolCheckoutRequirements: [expect.objectContaining({ operationRole: 'next', assemblyNumber: 'TA-001', checkedOut: false })],
    })
    expect(rpc).toHaveBeenCalledWith('production_tool_checkout_requirements', { p_work_order_id: 'wo-1', p_routing_step_id: 'step-1' })
  })
})

describe('tooling service contracts', () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue({ data: 'saved-id', error: null })
    storageFrom.mockReset()
    storageUpload.mockReset()
    storageRemove.mockReset()
    storageFrom.mockReturnValue({ upload: storageUpload, remove: storageRemove })
    storageUpload.mockResolvedValue({ data: {}, error: null })
    storageRemove.mockResolvedValue({ data: [], error: null })
  })

  it('creates and edits tool assemblies through the validated server mutation', async () => {
    const input = { id: 'tool-id', organizationId: 'org-id', name: 'Face mill assembly', description: 'Balanced' }
    await saveToolAssembly(input)
    await saveToolAssembly({ ...input, name: 'Updated face mill assembly' })

    expect(rpc).toHaveBeenNthCalledWith(1, 'save_tool_assembly', {
      p_tool_assembly_id: 'tool-id', p_organization_id: 'org-id', p_assembly_number: '',
      p_description: 'Face mill assembly', p_quantity_owned: 1, p_notes: 'Balanced',
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'save_tool_assembly', expect.objectContaining({ p_description: 'Updated face mill assembly', p_quantity_owned: 1 }))
  })

  it('lets PostgreSQL default a blank Tool Assembly name to its generated ID', async () => {
    await saveToolAssembly({ id: 'tool-id', organizationId: 'org-id', name: '   ', description: '' })

    expect(rpc).toHaveBeenCalledWith('save_tool_assembly', expect.objectContaining({
      p_assembly_number: '',
      p_description: '   ',
    }))
  })

  it('archives tool assemblies without deleting historical references', async () => {
    await setToolAssemblyArchived('tool-id', true)
    expect(rpc).toHaveBeenCalledWith('set_tool_assembly_archived', { p_tool_assembly_id: 'tool-id', p_archived: true })
  })

  it('uploads validated assembly images to a private tool-scoped path and replaces the stored reference', async () => {
    const file = Object.assign(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], { type: 'image/jpeg' }), { name: 'assembly.jpg' }) as File
    rpc.mockResolvedValueOnce({ data: 'org-id/tool-id/previous.jpg', error: null })

    await uploadToolAssemblyImage({ toolAssemblyId: 'tool-id', organizationId: 'org-id', file })

    expect(storageFrom).toHaveBeenCalledWith('tool-assembly-images')
    expect(storageUpload).toHaveBeenCalledWith(expect.stringMatching(/^org-id\/tool-id\/[0-9a-f-]+\.jpg$/), file, { contentType: 'image/jpeg', upsert: false })
    expect(rpc).toHaveBeenCalledWith('set_tool_assembly_image', {
      p_tool_assembly_id: 'tool-id', p_image_path: expect.stringMatching(/^org-id\/tool-id\/[0-9a-f-]+\.jpg$/),
    })
    expect(storageRemove).toHaveBeenCalledWith(['org-id/tool-id/previous.jpg'])
  })

  it('clears the assembly image reference before deleting its private object', async () => {
    rpc.mockResolvedValueOnce({ data: 'org-id/tool-id/current.webp', error: null })

    await removeToolAssemblyImage('tool-id', 'org-id/tool-id/current.webp')

    expect(rpc).toHaveBeenCalledWith('set_tool_assembly_image', { p_tool_assembly_id: 'tool-id', p_image_path: null })
    expect(storageRemove).toHaveBeenCalledWith(['org-id/tool-id/current.webp'])
  })

  it('records append-only physical checkout transactions independently of work orders', async () => {
    await recordToolCheckout({ toolAssemblyId: 'tool-id', transactionType: 'CHECK_OUT', note: 'For setup', requestId: 'request-id' })
    expect(rpc).toHaveBeenCalledWith('record_tool_checkout', {
      p_tool_assembly_id: 'tool-id', p_transaction_type: 'CHECK_OUT', p_quantity: 1, p_note: 'For setup', p_request_id: 'request-id',
    })
  })

  it('saves routing-operation tooling CRUD rows in display order', async () => {
    await saveRoutingTemplate({
      id: 'template-id', organizationId: 'org-id', templateName: 'Mill route',
      steps: [{ name: 'Mill', customerStageName: 'In production', instructions: '', tooling: [
        { key: 'routing-tool-1', toolAssemblyId: 'assembly-1', toolNumber: 't01', notes: 'Face' },
        { key: 'routing-tool-2', toolAssemblyId: 'assembly-2', toolNumber: 'T03', notes: 'Finish' },
      ] }],
    })
    expect(rpc).toHaveBeenCalledWith('save_routing_template', expect.objectContaining({
      p_steps: [{ routing_step_name: 'Mill', customer_stage_name: 'In production', work_instructions: '', tooling: [
        { tool_assembly_id: 'assembly-1', tool_number: 'T01', notes: 'Face' },
        { tool_assembly_id: 'assembly-2', tool_number: 'T03', notes: 'Finish' },
      ] }],
    }))
  })

  it('copies routing tooling in the atomic work-order release payload', async () => {
    await createWorkOrder({
      organizationId: 'org-id', workOrderName: '', salesOrderId: 'so-id', salesOrderLineItemId: 'line-id',
      partNumber: 'PART-1', quantityOrdered: 5, dueDate: '2026-09-01', notes: '',
      routing: [{ sequenceNumber: 20, name: 'Mill', customerStageName: 'In production', instructions: '', tooling: [
        { sourceRoutingOperationToolId: 'routing-tool-id', toolAssemblyId: 'assembly-id', toolNumber: 't07', notes: 'Drill' },
      ] }],
    }, 'request-id')
    expect(rpc).toHaveBeenCalledWith('create_work_order', expect.objectContaining({
      p_routing: [expect.objectContaining({ tooling: [{ tool_assembly_id: 'assembly-id', tool_number: 'T07', notes: 'Drill', source_routing_operation_tool_id: 'routing-tool-id' }] })],
    }))
  })

  it('saves work-order-specific tooling without invoking routing-template mutations', async () => {
    await saveWorkOrderOperationTools('work-order-operation-id', [
      { key: 'work-order-tool-id', toolAssemblyId: 'assembly-id', toolNumber: 't12', notes: 'Run override' },
    ])
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('save_work_order_operation_tools', {
      p_work_order_operation_id: 'work-order-operation-id',
      p_tools: [{ id: 'work-order-tool-id', tool_assembly_id: 'assembly-id', tool_number: 'T12', notes: 'Run override', source_routing_operation_tool_id: null }],
    })
  })
})
