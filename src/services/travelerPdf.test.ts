import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SalesOrder, WorkOrder, WorkOrderOperationTool } from '../domain/types'

const { MockPdf, pdfInstances, qrToDataUrl } = vi.hoisted(() => {
  const instances: Array<{
    textCalls: Array<{ value: string | string[]; x: number; y: number }>
    splitCalls: Array<{ value: string; width: number }>
  }> = []
  class Pdf {
    internal = { pageSize: { getWidth: () => 215.9, getHeight: () => 279.4 } }
    textCalls: Array<{ value: string | string[]; x: number; y: number }> = []
    splitCalls: Array<{ value: string; width: number }> = []

    constructor() { instances.push(this) }
    splitTextToSize(value: string, width: number) {
      this.splitCalls.push({ value, width })
      const charactersPerLine = Math.max(1, Math.floor(width / 2))
      return value.match(new RegExp(`.{1,${charactersPerLine}}(?:\\s|$)`, 'g'))?.map((line) => line.trim()) ?? [value]
    }
    text(value: string | string[], x: number, y: number) { this.textCalls.push({ value, x, y }) }
    addPage() {}
    addImage() {}
    line() {}
    rect() {}
    roundedRect() {}
    save() {}
    setDrawColor() {}
    setFillColor() {}
    setFont() {}
    setFontSize() {}
    setTextColor() {}
  }
  return { MockPdf: Pdf, pdfInstances: instances, qrToDataUrl: vi.fn(async () => 'data:image/png;base64,qr') }
})

vi.mock('jspdf', () => ({ default: MockPdf }))
vi.mock('qrcode', () => ({ default: { toDataURL: qrToDataUrl } }))

import { generateTravelerPdf, toolingForOperation } from './travelerPdf'

const salesOrder: SalesOrder = {
  id: 'sales-order', organizationId: 'organization', salesOrderNumber: '1001', salesOrderName: '1001',
  customerId: 'customer', customerName: 'Customer', customerAddress: '', customerPoNumber: 'PO-1',
  shipToAddress: '', billToAddress: '', dateReceived: '2026-08-01', orderDueDate: '2026-08-30',
  shippedAt: null, invoicedAt: null, archivedAt: null, notes: '', lines: [],
}

const assignments: WorkOrderOperationTool[] = [
  { id: 'tool-3', workOrderOperationId: 'op-20', toolAssemblyId: 'assembly-22', toolAssemblyNumber: 'TA-022', toolAssemblyName: '#7 Drill Assembly', toolAssemblyDescription: '', toolNumber: 'T07', sequenceNumber: 30, notes: '', sourceRoutingOperationToolId: null },
  { id: 'wrong-operation', workOrderOperationId: 'op-10', toolAssemblyId: 'assembly-99', toolAssemblyNumber: 'TA-099', toolAssemblyName: 'Saw Tool Assembly', toolAssemblyDescription: '', toolNumber: 'T02', sequenceNumber: 10, notes: '', sourceRoutingOperationToolId: null },
  { id: 'tool-1', workOrderOperationId: 'op-20', toolAssemblyId: 'assembly-1', toolAssemblyNumber: 'TA-001', toolAssemblyName: '2" Face Mill Assembly', toolAssemblyDescription: 'Verify insert torque.', toolNumber: 'T01', sequenceNumber: 10, notes: '', sourceRoutingOperationToolId: null },
  { id: 'tool-2', workOrderOperationId: 'op-20', toolAssemblyId: 'assembly-14', toolAssemblyNumber: 'TA-014', toolAssemblyName: '1/2" End Mill Assembly', toolAssemblyDescription: '', toolNumber: 'T03', sequenceNumber: 20, notes: '', sourceRoutingOperationToolId: null },
]

function workOrder(operationTooling: WorkOrderOperationTool[] = assignments): WorkOrder {
  return {
    id: 'work-order', organizationId: 'organization', workOrderNumber: '2001', workOrderName: '2001',
    salesOrderId: salesOrder.id, salesOrderLineItemId: 'line', partNumber: 'PART-1', quantityOrdered: 10,
    dueDate: '2026-08-30', releasedAt: '2026-08-01T12:00:00Z', completionDate: null, archivedAt: null,
    notes: '', operationTooling,
    routing: [
      { id: 'op-10', workOrderId: 'work-order', sequenceNumber: 10, routingStepName: 'SAW', customerStageName: 'In production', workInstructions: 'Cut stock.', notes: '' },
      { id: 'op-20', workOrderId: 'work-order', sequenceNumber: 20, routingStepName: 'MILLING', customerStageName: 'In production', workInstructions: 'Machine complete.', notes: '' },
      { id: 'op-30', workOrderId: 'work-order', sequenceNumber: 30, routingStepName: 'INSPECTION', customerStageName: 'Inspection', workInstructions: 'Inspect.', notes: '' },
    ],
  }
}

function renderedText(pdf: (typeof pdfInstances)[number]): string[] {
  return pdf.textCalls.flatMap((call) => Array.isArray(call.value) ? call.value : [call.value])
}

describe('traveler operation tooling', () => {
  beforeEach(() => {
    pdfInstances.length = 0
    qrToDataUrl.mockClear()
    vi.stubGlobal('window', { location: { origin: 'https://shopcore.example' } })
  })

  it('keeps tools with their operation and sorts multiple assignments by tool number', () => {
    expect(toolingForOperation('op-20', assignments).map((tool) => tool.toolNumber)).toEqual(['T01', 'T03', 'T07'])
    expect(toolingForOperation('op-20', assignments).some((tool) => tool.id === 'wrong-operation')).toBe(false)
  })

  it('renders tool number, assembly name, and description beneath the correct operation', async () => {
    await generateTravelerPdf(workOrder(), salesOrder)

    const text = renderedText(pdfInstances[0])
    const op10 = text.indexOf('STEP 10')
    const sawTool = text.indexOf('TA-099')
    const op20 = text.indexOf('STEP 20')
    const firstMillTool = text.indexOf('TA-001')
    const secondMillTool = text.indexOf('TA-014')
    const thirdMillTool = text.indexOf('TA-022')
    const op30 = text.indexOf('STEP 30')

    expect(text).toContain('TOOL NUMBER / POSITION')
    expect(text).toContain('TOOL ASSEMBLY')
    expect(text).toContain('NAME / DESCRIPTION')
    expect(text).toContain('Description: Verify insert torque.')
    expect(op10).toBeLessThan(sawTool)
    expect(sawTool).toBeLessThan(op20)
    expect(op20).toBeLessThan(firstMillTool)
    expect(firstMillTool).toBeLessThan(text.indexOf('Description: Verify insert torque.'))
    expect(firstMillTool).toBeLessThan(secondMillTool)
    expect(secondMillTool).toBeLessThan(thirdMillTool)
    expect(thirdMillTool).toBeLessThan(op30)
  })

  it('labels every station QR with its production action', async () => {
    await generateTravelerPdf(workOrder(), salesOrder)

    expect(renderedText(pdfInstances[0]).filter((line) => line === 'SCAN TO TRANSFER')).toHaveLength(3)
    expect(qrToDataUrl).toHaveBeenCalledTimes(3)
    expect(qrToDataUrl).toHaveBeenCalledWith(expect.stringContaining('/produce/work-order/op-10'), expect.objectContaining({ margin: 4, errorCorrectionLevel: 'M' }))
  })

  it('uses updated work-order assignments and ignores routing-default-shaped data', async () => {
    const updated = workOrder([{ ...assignments[2], toolAssemblyNumber: 'TA-777', toolNumber: 'T12' }])
    const inputWithRoutingDefaults = Object.assign(updated, {
      routingDefaultTooling: [{ toolAssemblyNumber: 'TA-001', toolNumber: 'T01' }],
    })

    await generateTravelerPdf(inputWithRoutingDefaults, salesOrder)

    const text = renderedText(pdfInstances[0])
    expect(text).toContain('TA-777')
    expect(text).toContain('T12')
    expect(text).not.toContain('TA-001')
    expect(text).not.toContain('T01')
  })

  it('omits tooling entirely for operations without assignments', async () => {
    await generateTravelerPdf(workOrder([]), salesOrder)

    expect(renderedText(pdfInstances[0])).not.toContain('TOOLING')
  })

  it('wraps long tool names within the tooling detail column', async () => {
    const name = 'Extra-long precision boring assembly with extended reach and a descriptive setup note that must remain readable'
    await generateTravelerPdf(workOrder([{ ...assignments[2], toolAssemblyName: name }]), salesOrder)

    const nameSplit = pdfInstances[0].splitCalls.find((call) => call.value === name)
    expect(nameSplit?.width).toBeGreaterThan(0)
    expect(nameSplit?.width).toBeLessThan(125)
    expect(renderedText(pdfInstances[0]).some((line) => line.startsWith('Extra-long precision'))).toBe(true)
  })

  it('wraps long assembly descriptions within the tooling detail column', async () => {
    const description = 'Use the balanced holder, verify insert torque, and inspect runout before starting the operation'
    await generateTravelerPdf(workOrder([{ ...assignments[2], toolAssemblyDescription: description }]), salesOrder)

    const descriptionSplit = pdfInstances[0].splitCalls.find((call) => call.value === `Description: ${description}`)
    expect(descriptionSplit?.width).toBeGreaterThan(0)
    expect(descriptionSplit?.width).toBeLessThan(125)
  })
})
