import type { AppRole, Invoice, ProductionEvent, Question, ShopData } from '../domain/types'
import { requireSupabase } from '../lib/supabase'

const mapRows = <T>(value: unknown): T => value as T

export async function loadShopData(role: AppRole): Promise<ShopData> {
  if (role === 'customer') return loadCustomerPortalData()
  const client = requireSupabase()
  const [organization, customers, salesOrders, lines, workOrders, routing, events, questions, invoices] = await Promise.all([
    client.from('organizations').select('id, name').single(),
    client.from('customers').select('*').order('customer_name'),
    client.from('sales_orders').select('*').order('date_received', { ascending: false }),
    client.from('sales_order_line_items').select('*').order('sort_order'),
    client.from('work_orders').select('*').order('due_date'),
    client.from('routing_steps').select('*').order('sequence_number'),
    client.from('production_events').select('*').order('created_at'),
    client.from('customer_messages').select('*').order('created_at'),
    client.from('invoices').select('*').order('invoice_date', { ascending: false }),
  ])
  const firstError = [organization, customers, salesOrders, lines, workOrders, routing, events, questions, invoices].find((result) => result.error)?.error
  if (firstError) throw firstError
  if (!organization.data) throw new Error('No accessible organization was found for this user.')

  const lineRows = mapRows<Record<string, unknown>[]>(lines.data ?? [])
  const routingRows = mapRows<Record<string, unknown>[]>(routing.data ?? [])
  return {
    organization: { id: organization.data.id, name: organization.data.name },
    customers: mapRows<Record<string, unknown>[]>(customers.data ?? []).map((row) => ({ id: String(row.id), organizationId: String(row.organization_id), customerName: String(row.customer_name), primaryAddress: String(row.primary_address ?? ''), defaultShipToAddress: String(row.default_ship_to_address ?? ''), defaultBillToAddress: String(row.default_bill_to_address ?? '') })),
    salesOrders: mapRows<Record<string, unknown>[]>(salesOrders.data ?? []).map((row) => ({ id: String(row.id), organizationId: String(row.organization_id), salesOrderNumber: String(row.sales_order_number), customerId: String(row.customer_id), customerName: String(row.customer_name), customerAddress: String(row.customer_address ?? ''), customerPoNumber: String(row.customer_po_number), shipToAddress: String(row.ship_to_address ?? ''), billToAddress: String(row.bill_to_address ?? ''), dateReceived: String(row.date_received), orderDueDate: String(row.order_due_date), notes: String(row.notes ?? ''), lines: lineRows.filter((line) => line.sales_order_id === row.id).map((line) => ({ id: String(line.id), salesOrderId: String(line.sales_order_id), lineNumber: Number(line.line_number), partNumber: line.part_number ? String(line.part_number) : null, description: String(line.description), manufacturedItem: Boolean(line.manufactured_item), pricingType: line.pricing_type as 'per_piece' | 'flat_rate', quantity: Number(line.quantity), unitPrice: line.unit_price == null ? null : Number(line.unit_price), flatRateAmount: line.flat_rate_amount == null ? null : Number(line.flat_rate_amount), lineTotal: Number(line.line_total), sortOrder: Number(line.sort_order) })) })),
    workOrders: mapRows<Record<string, unknown>[]>(workOrders.data ?? []).map((row) => ({ id: String(row.id), organizationId: String(row.organization_id), workOrderNumber: String(row.work_order_number), salesOrderId: String(row.sales_order_id), salesOrderLineItemId: String(row.sales_order_line_item_id), partNumber: String(row.part_number), quantityOrdered: Number(row.quantity_ordered), dueDate: String(row.due_date), releasedAt: String(row.released_at), completionDate: row.completion_date ? String(row.completion_date) : null, notes: String(row.notes ?? ''), routing: routingRows.filter((step) => step.work_order_id === row.id).map((step) => ({ id: String(step.id), workOrderId: String(step.work_order_id), sequenceNumber: Number(step.sequence_number), routingStepName: String(step.routing_step_name), customerStageName: String(step.customer_stage_name), workInstructions: String(step.work_instructions ?? ''), workInstructionsRevision: step.work_instructions_revision ? String(step.work_instructions_revision) : null, notes: String(step.notes ?? '') })) })),
    productionEvents: mapRows<Record<string, unknown>[]>(events.data ?? []).map((row) => ({ id: String(row.id), organizationId: String(row.organization_id), workOrderId: String(row.work_order_id), routingStepId: String(row.routing_step_id), eventType: row.event_type as ProductionEvent['eventType'], quantity: Number(row.quantity), fromRoutingStepId: row.from_routing_step_id ? String(row.from_routing_step_id) : null, toRoutingStepId: row.to_routing_step_id ? String(row.to_routing_step_id) : null, reversedEventId: row.reversed_event_id ? String(row.reversed_event_id) : null, createdAt: String(row.created_at) })),
    questions: mapRows<Record<string, unknown>[]>(questions.data ?? []).map((row) => ({ id: String(row.id), organizationId: String(row.organization_id), customerId: String(row.customer_id), salesOrderId: row.sales_order_id ? String(row.sales_order_id) : null, senderType: row.sender_type as Question['senderType'], message: String(row.message), createdAt: String(row.created_at), readAt: row.read_at ? String(row.read_at) : null })),
    invoices: mapRows<Record<string, unknown>[]>(invoices.data ?? []).map((row) => ({ id: String(row.id), organizationId: String(row.organization_id), customerId: String(row.customer_id), salesOrderId: row.sales_order_id ? String(row.sales_order_id) : null, invoiceNumber: String(row.invoice_number), invoiceDate: String(row.invoice_date), amount: row.amount == null ? null : Number(row.amount), filePath: String(row.file_path), uploadedAt: String(row.uploaded_at) })),
  }
}

async function loadCustomerPortalData(): Promise<ShopData> {
  const client = requireSupabase()
  const [organization, customers, salesOrders, lines, workOrders, questions, invoices] = await Promise.all([
    client.from('organizations').select('id, name').single(),
    client.from('customers').select('id, organization_id, customer_name').single(),
    client.rpc('customer_portal_sales_orders'),
    client.rpc('customer_portal_sales_order_lines'),
    client.rpc('customer_portal_work_orders'),
    client.from('customer_messages').select('*').order('created_at'),
    client.from('invoices').select('*').order('invoice_date', { ascending: false }),
  ])
  const firstError = [organization, customers, salesOrders, lines, workOrders, questions, invoices]
    .find((result) => result.error)?.error
  if (firstError) throw firstError
  if (!organization.data) throw new Error('No accessible organization was found for this user.')

  const lineRows = mapRows<Record<string, unknown>[]>(lines.data ?? [])
  return {
    organization: { id: organization.data.id, name: organization.data.name },
    customers: customers.data ? [{
      id: String(customers.data.id),
      organizationId: String(customers.data.organization_id),
      customerName: String(customers.data.customer_name),
      primaryAddress: '',
      defaultShipToAddress: '',
      defaultBillToAddress: '',
    }] : [],
    salesOrders: mapRows<Record<string, unknown>[]>(salesOrders.data ?? []).map((row) => ({
      id: String(row.id),
      organizationId: String(row.organization_id),
      salesOrderNumber: String(row.sales_order_number),
      customerId: String(row.customer_id),
      customerName: String(row.customer_name),
      customerAddress: '',
      customerPoNumber: String(row.customer_po_number),
      shipToAddress: '',
      billToAddress: '',
      dateReceived: String(row.date_received),
      orderDueDate: String(row.order_due_date),
      notes: '',
      lines: lineRows.filter((line) => line.sales_order_id === row.id).map((line) => ({
        id: String(line.id),
        salesOrderId: String(line.sales_order_id),
        lineNumber: Number(line.line_number),
        partNumber: line.part_number ? String(line.part_number) : null,
        description: String(line.description),
        manufacturedItem: Boolean(line.manufactured_item),
        pricingType: 'per_piece' as const,
        quantity: Number(line.quantity),
        unitPrice: null,
        flatRateAmount: null,
        lineTotal: 0,
        sortOrder: Number(line.sort_order),
      })),
    })),
    workOrders: mapRows<Record<string, unknown>[]>(workOrders.data ?? []).map((row) => ({
      id: String(row.id),
      organizationId: String(row.organization_id),
      workOrderNumber: '',
      salesOrderId: String(row.sales_order_id),
      salesOrderLineItemId: String(row.sales_order_line_item_id),
      partNumber: String(row.part_number),
      quantityOrdered: Number(row.quantity_ordered),
      dueDate: String(row.due_date),
      releasedAt: '',
      completionDate: row.completion_date ? String(row.completion_date) : null,
      notes: '',
      routing: [],
      customerProgressPercent: Number(row.customer_progress_percent),
      customerStageName: String(row.customer_stage_name),
    })),
    productionEvents: [],
    questions: mapRows<Record<string, unknown>[]>(questions.data ?? []).map((row) => ({ id: String(row.id), organizationId: String(row.organization_id), customerId: String(row.customer_id), salesOrderId: row.sales_order_id ? String(row.sales_order_id) : null, senderType: row.sender_type as Question['senderType'], message: String(row.message), createdAt: String(row.created_at), readAt: row.read_at ? String(row.read_at) : null })),
    invoices: mapRows<Record<string, unknown>[]>(invoices.data ?? []).map((row) => ({ id: String(row.id), organizationId: String(row.organization_id), customerId: String(row.customer_id), salesOrderId: row.sales_order_id ? String(row.sales_order_id) : null, invoiceNumber: String(row.invoice_number), invoiceDate: String(row.invoice_date), amount: row.amount == null ? null : Number(row.amount), filePath: String(row.file_path), uploadedAt: String(row.uploaded_at) })),
  }
}

function mapProductionEvent(row: Record<string, unknown>): ProductionEvent {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    workOrderId: String(row.work_order_id),
    routingStepId: String(row.routing_step_id),
    eventType: row.event_type as ProductionEvent['eventType'],
    quantity: Number(row.quantity),
    fromRoutingStepId: row.from_routing_step_id ? String(row.from_routing_step_id) : null,
    toRoutingStepId: row.to_routing_step_id ? String(row.to_routing_step_id) : null,
    reversedEventId: row.reversed_event_id ? String(row.reversed_event_id) : null,
    createdAt: String(row.created_at),
  }
}

export async function recordProductionEvent(input: { workOrderId: string; routingStepId: string; eventType: 'transfer' | 'scrap'; quantity: number; toRoutingStepId?: string | null }): Promise<ProductionEvent> {
  const { data, error } = await requireSupabase().rpc('record_production_event', {
    p_work_order_id: input.workOrderId,
    p_routing_step_id: input.routingStepId,
    p_event_type: input.eventType,
    p_quantity: input.quantity,
    p_to_routing_step_id: input.toRoutingStepId ?? null,
  }).single()
  if (error) throw error
  return mapProductionEvent(mapRows<Record<string, unknown>>(data))
}

export async function reverseProductionEvent(eventId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('reverse_production_event', { p_event_id: eventId })
  if (error) throw error
}

export async function recordProductionAdjustment(input: { workOrderId: string; routingStepId: string; quantity: number }): Promise<void> {
  const { error } = await requireSupabase().rpc('record_production_event', {
    p_work_order_id: input.workOrderId,
    p_routing_step_id: input.routingStepId,
    p_event_type: 'adjustment',
    p_quantity: input.quantity,
    p_to_routing_step_id: null,
  })
  if (error) throw error
}

export async function sendQuestion(input: Omit<Question, 'id' | 'createdAt' | 'readAt'>): Promise<void> {
  const { error } = await requireSupabase().from('customer_messages').insert({ organization_id: input.organizationId, customer_id: input.customerId, sales_order_id: input.salesOrderId, sender_type: input.senderType, message: input.message })
  if (error) throw error
}

export async function uploadInvoice(file: File, invoice: Omit<Invoice, 'id' | 'uploadedAt' | 'filePath'>): Promise<void> {
  if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Only PDF invoices are allowed.')
  const client = requireSupabase()
  const safeName = invoice.invoiceNumber.replace(/[^a-z0-9-_]/gi, '_')
  const filePath = `${invoice.organizationId}/${invoice.customerId}/${crypto.randomUUID()}-${safeName}.pdf`
  const upload = await client.storage.from('invoices').upload(filePath, file, { contentType: 'application/pdf', upsert: false })
  if (upload.error) throw upload.error
  const metadata = await client.from('invoices').insert({ organization_id: invoice.organizationId, customer_id: invoice.customerId, sales_order_id: invoice.salesOrderId, invoice_number: invoice.invoiceNumber, invoice_date: invoice.invoiceDate, amount: invoice.amount, file_path: filePath })
  if (metadata.error) {
    await client.storage.from('invoices').remove([filePath])
    throw metadata.error
  }
}

export async function getInvoiceUrl(filePath: string): Promise<string> {
  const { data, error } = await requireSupabase().storage.from('invoices').createSignedUrl(filePath, 60)
  if (error) throw error
  return data.signedUrl
}

export interface CustomerInput {
  organizationId: string
  customerName: string
  primaryAddress: string
  shipToAddress: string
  billToAddress: string
}

export interface SalesOrderInput {
  organizationId: string
  salesOrderNumber: string
  customerId: string
  customerName: string
  customerAddress: string
  customerPoNumber: string
  shipToAddress: string
  billToAddress: string
  dateReceived: string
  orderDueDate: string
  notes: string
  lines: Array<{ lineNumber: number; partNumber: string | null; description: string; manufacturedItem: boolean; pricingType: 'per_piece' | 'flat_rate'; quantity: number; unitPrice: number | null; flatRateAmount: number | null; sortOrder: number }>
}

export interface WorkOrderInput {
  organizationId: string
  workOrderNumber: string
  salesOrderId: string
  salesOrderLineItemId: string
  partNumber: string
  quantityOrdered: number
  dueDate: string
  notes: string
  routing: Array<{ sequenceNumber: number; name: string; customerStageName: string; instructions: string; revision: string | null }>
}

export async function createCustomer(input: CustomerInput): Promise<void> {
  const { error } = await requireSupabase().from('customers').insert({ organization_id: input.organizationId, customer_name: input.customerName, primary_address: input.primaryAddress, default_ship_to_address: input.shipToAddress, default_bill_to_address: input.billToAddress })
  if (error) throw error
}

export async function createSalesOrder(input: SalesOrderInput): Promise<void> {
  const { error } = await requireSupabase().rpc('create_sales_order', {
    p_order: {
      organization_id: input.organizationId, sales_order_number: input.salesOrderNumber, customer_id: input.customerId,
      customer_name: input.customerName, customer_address: input.customerAddress, customer_po_number: input.customerPoNumber,
      ship_to_address: input.shipToAddress, bill_to_address: input.billToAddress, date_received: input.dateReceived,
      order_due_date: input.orderDueDate, notes: input.notes,
    },
    p_lines: input.lines.map((line) => ({ line_number: line.lineNumber, part_number: line.partNumber, description: line.description, manufactured_item: line.manufacturedItem, pricing_type: line.pricingType, quantity: line.quantity, unit_price: line.unitPrice, flat_rate_amount: line.flatRateAmount, sort_order: line.sortOrder })),
  })
  if (error) throw error
}

export async function createWorkOrder(input: WorkOrderInput): Promise<void> {
  const { error } = await requireSupabase().rpc('create_work_order', {
    p_work_order: { organization_id: input.organizationId, work_order_number: input.workOrderNumber, sales_order_id: input.salesOrderId, sales_order_line_item_id: input.salesOrderLineItemId, part_number: input.partNumber, quantity_ordered: input.quantityOrdered, due_date: input.dueDate, notes: input.notes },
    p_routing: input.routing.map((step) => ({ sequence_number: step.sequenceNumber, routing_step_name: step.name, customer_stage_name: step.customerStageName, work_instructions: step.instructions, work_instructions_revision: step.revision })),
  })
  if (error) throw error
}
