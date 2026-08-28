import type { AppRole, CustomerDocument, ProductionEvent, Question, ShopData } from '../domain/types'
import { validateDocumentPdf } from '../domain/documentSecurity'
import { requireSupabase } from '../lib/supabase'

const mapRows = <T>(value: unknown): T => value as T

export async function loadShopData(role: AppRole): Promise<ShopData> {
  if (role === 'customer') return loadCustomerPortalData()
  const client = requireSupabase()
  const [organization, customers, salesOrders, lines, workOrders, routing, events, questions, documents] = await Promise.all([
    client.from('organizations').select('id, name').single(),
    client.from('customers').select('*').order('customer_name'),
    client.from('sales_orders').select('*').order('date_received', { ascending: false }),
    client.from('sales_order_line_items').select('*').order('sort_order'),
    client.from('work_orders').select('*').order('due_date'),
    client.from('routing_steps').select('*').order('sequence_number'),
    client.from('production_events').select('*').order('created_at'),
    client.from('customer_messages').select('*').order('created_at'),
    client.from('customer_documents').select('*').order('document_date', { ascending: false }),
  ])
  const firstError = [organization, customers, salesOrders, lines, workOrders, routing, events, questions, documents].find((result) => result.error)?.error
  if (firstError) throw firstError
  if (!organization.data) throw new Error('No accessible organization was found for this user.')

  const lineRows = mapRows<Record<string, unknown>[]>(lines.data ?? [])
  const routingRows = mapRows<Record<string, unknown>[]>(routing.data ?? [])
  return {
    organization: { id: organization.data.id, name: organization.data.name },
    customers: mapRows<Record<string, unknown>[]>(customers.data ?? []).map((row) => ({ id: String(row.id), organizationId: String(row.organization_id), customerName: String(row.customer_name), logoUrl: row.logo_url ? String(row.logo_url) : null, primaryAddress: String(row.primary_address ?? ''), defaultShipToAddress: String(row.default_ship_to_address ?? ''), defaultBillToAddress: String(row.default_bill_to_address ?? '') })),
    salesOrders: mapRows<Record<string, unknown>[]>(salesOrders.data ?? []).map((row) => ({ id: String(row.id), organizationId: String(row.organization_id), salesOrderNumber: String(row.sales_order_number), salesOrderName: String(row.sales_order_name), customerId: String(row.customer_id), customerName: String(row.customer_name), customerAddress: String(row.customer_address ?? ''), customerPoNumber: String(row.customer_po_number), shipToAddress: String(row.ship_to_address ?? ''), billToAddress: String(row.bill_to_address ?? ''), dateReceived: String(row.date_received), orderDueDate: String(row.order_due_date), shippedAt: row.shipped_at ? String(row.shipped_at) : null, invoicedAt: row.invoiced_at ? String(row.invoiced_at) : null, archivedAt: row.archived_at ? String(row.archived_at) : null, notes: String(row.notes ?? ''), lines: lineRows.filter((line) => line.sales_order_id === row.id).map((line) => ({ id: String(line.id), salesOrderId: String(line.sales_order_id), lineNumber: Number(line.line_number), partNumber: line.part_number ? String(line.part_number) : null, description: String(line.description), manufacturedItem: Boolean(line.manufactured_item), pricingType: line.pricing_type as 'per_piece' | 'flat_rate', quantity: Number(line.quantity), unitPrice: line.unit_price == null ? null : Number(line.unit_price), flatRateAmount: line.flat_rate_amount == null ? null : Number(line.flat_rate_amount), lineTotal: Number(line.line_total), sortOrder: Number(line.sort_order), archivedAt: line.archived_at ? String(line.archived_at) : null })) })),
    workOrders: mapRows<Record<string, unknown>[]>(workOrders.data ?? []).map((row) => ({ id: String(row.id), organizationId: String(row.organization_id), workOrderNumber: String(row.work_order_number), workOrderName: String(row.work_order_name), salesOrderId: String(row.sales_order_id), salesOrderLineItemId: String(row.sales_order_line_item_id), partNumber: String(row.part_number), quantityOrdered: Number(row.quantity_ordered), dueDate: String(row.due_date), releasedAt: String(row.released_at), completionDate: row.completion_date ? String(row.completion_date) : null, archivedAt: row.archived_at ? String(row.archived_at) : null, notes: String(row.notes ?? ''), routing: routingRows.filter((step) => step.work_order_id === row.id).map((step) => ({ id: String(step.id), workOrderId: String(step.work_order_id), sequenceNumber: Number(step.sequence_number), routingStepName: String(step.routing_step_name), customerStageName: String(step.customer_stage_name), workInstructions: String(step.work_instructions ?? ''), notes: String(step.notes ?? '') })) })),
    productionEvents: mapRows<Record<string, unknown>[]>(events.data ?? []).map((row) => ({ id: String(row.id), organizationId: String(row.organization_id), workOrderId: String(row.work_order_id), routingStepId: String(row.routing_step_id), eventType: row.event_type as ProductionEvent['eventType'], quantity: Number(row.quantity), fromRoutingStepId: row.from_routing_step_id ? String(row.from_routing_step_id) : null, toRoutingStepId: row.to_routing_step_id ? String(row.to_routing_step_id) : null, reversedEventId: row.reversed_event_id ? String(row.reversed_event_id) : null, createdAt: String(row.created_at) })),
    questions: mapRows<Record<string, unknown>[]>(questions.data ?? []).map((row) => ({ id: String(row.id), organizationId: String(row.organization_id), customerId: String(row.customer_id), salesOrderId: row.sales_order_id ? String(row.sales_order_id) : null, senderType: row.sender_type as Question['senderType'], message: String(row.message), createdAt: String(row.created_at), readAt: row.read_at ? String(row.read_at) : null })),
    documents: mapRows<Record<string, unknown>[]>(documents.data ?? []).map(mapCustomerDocument),
  }
}

async function loadCustomerPortalData(): Promise<ShopData> {
  const client = requireSupabase()
  const [organization, customers, salesOrders, lines, workOrders, questions, documents] = await Promise.all([
    client.from('organizations').select('id, name').single(),
    client.from('customers').select('id, organization_id, customer_name').single(),
    client.rpc('customer_portal_sales_orders'),
    client.rpc('customer_portal_sales_order_lines'),
    client.rpc('customer_portal_work_orders'),
    client.from('customer_messages').select('*').order('created_at'),
    client.from('customer_documents').select('*').order('document_date', { ascending: false }),
  ])
  const firstError = [organization, customers, salesOrders, lines, workOrders, questions, documents]
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
      logoUrl: null,
      primaryAddress: '',
      defaultShipToAddress: '',
      defaultBillToAddress: '',
    }] : [],
    salesOrders: mapRows<Record<string, unknown>[]>(salesOrders.data ?? []).map((row) => ({
      id: String(row.id),
      organizationId: String(row.organization_id),
      salesOrderNumber: '',
      salesOrderName: String(row.sales_order_name),
      customerId: String(row.customer_id),
      customerName: String(row.customer_name),
      customerAddress: '',
      customerPoNumber: String(row.customer_po_number),
      shipToAddress: '',
      billToAddress: '',
      dateReceived: String(row.date_received),
      orderDueDate: String(row.order_due_date),
      shippedAt: row.shipped_at ? String(row.shipped_at) : null,
      invoicedAt: row.invoiced_at ? String(row.invoiced_at) : null,
      archivedAt: null,
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
        archivedAt: null,
      })),
    })),
    workOrders: mapRows<Record<string, unknown>[]>(workOrders.data ?? []).map((row) => ({
      id: String(row.id),
      organizationId: String(row.organization_id),
      workOrderNumber: '',
      workOrderName: '',
      salesOrderId: String(row.sales_order_id),
      salesOrderLineItemId: String(row.sales_order_line_item_id),
      partNumber: String(row.part_number),
      quantityOrdered: Number(row.quantity_ordered),
      dueDate: String(row.due_date),
      releasedAt: '',
      completionDate: row.completion_date ? String(row.completion_date) : null,
      archivedAt: null,
      notes: '',
      routing: [],
      customerProgressPercent: Number(row.customer_progress_percent),
      customerStageName: String(row.customer_stage_name),
    })),
    productionEvents: [],
    questions: mapRows<Record<string, unknown>[]>(questions.data ?? []).map((row) => ({ id: String(row.id), organizationId: String(row.organization_id), customerId: String(row.customer_id), salesOrderId: row.sales_order_id ? String(row.sales_order_id) : null, senderType: row.sender_type as Question['senderType'], message: String(row.message), createdAt: String(row.created_at), readAt: row.read_at ? String(row.read_at) : null })),
    documents: mapRows<Record<string, unknown>[]>(documents.data ?? []).map(mapCustomerDocument),
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

function mapCustomerDocument(row: Record<string, unknown>): CustomerDocument {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    customerId: String(row.customer_id),
    salesOrderId: row.sales_order_id ? String(row.sales_order_id) : null,
    documentType: row.document_type as CustomerDocument['documentType'],
    documentName: String(row.document_name),
    documentDate: String(row.document_date),
    amount: row.amount == null ? null : Number(row.amount),
    filePath: String(row.file_path),
    uploadedAt: String(row.uploaded_at),
  }
}

export async function uploadDocument(file: File, document: Omit<CustomerDocument, 'id' | 'uploadedAt' | 'filePath'>): Promise<void> {
  await validateDocumentPdf(file)
  const client = requireSupabase()
  const safeName = document.documentName.replace(/[^a-z0-9-_]/gi, '_')
  const filePath = `${document.organizationId}/${document.customerId}/${crypto.randomUUID()}-${safeName}.pdf`
  const upload = await client.storage.from('invoices').upload(filePath, file, { contentType: 'application/pdf', upsert: false })
  if (upload.error) throw upload.error
  const metadata = await client.from('customer_documents').insert({ organization_id: document.organizationId, customer_id: document.customerId, sales_order_id: document.salesOrderId, document_type: document.documentType, document_name: document.documentName, document_date: document.documentDate, amount: document.documentType === 'invoice' ? document.amount : null, file_path: filePath, upload_attestation_version: 'manufacturer-document-upload-v1' })
  if (metadata.error) {
    await client.storage.from('invoices').remove([filePath])
    throw metadata.error
  }
}

export async function getDocumentUrl(filePath: string): Promise<string> {
  const { data, error } = await requireSupabase().storage.from('invoices').createSignedUrl(filePath, 60)
  if (error) throw error
  return data.signedUrl
}

export interface CustomerInput {
  organizationId: string
  customerName: string
  logoUrl: string
  primaryAddress: string
  shipToAddress: string
  billToAddress: string
}

export interface SalesOrderInput {
  organizationId: string
  salesOrderName: string
  customerId: string
  customerName: string
  customerAddress: string
  customerPoNumber: string
  shipToAddress: string
  billToAddress: string
  dateReceived: string
  orderDueDate: string
  notes: string
  lines: Array<SalesOrderLineInput & { lineNumber: number; sortOrder: number }>
}

export interface SalesOrderLineInput {
  partNumber: string | null
  description: string
  manufacturedItem: boolean
  pricingType: 'per_piece' | 'flat_rate'
  quantity: number
  unitPrice: number | null
  flatRateAmount: number | null
}

export interface WorkOrderInput {
  organizationId: string
  workOrderName: string
  salesOrderId: string
  salesOrderLineItemId: string
  partNumber: string
  quantityOrdered: number
  dueDate: string
  notes: string
  routing: Array<{ sequenceNumber: number; name: string; customerStageName: string; instructions: string }>
}

export async function createCustomer(input: CustomerInput): Promise<void> {
  const { error } = await requireSupabase().from('customers').insert({ organization_id: input.organizationId, customer_name: input.customerName, logo_url: normalizeCustomerLogoUrl(input.logoUrl), primary_address: input.primaryAddress, default_ship_to_address: input.shipToAddress, default_bill_to_address: input.billToAddress })
  if (error) throw error
}

export async function updateCustomer(customerId: string, input: CustomerInput): Promise<void> {
  const { error } = await requireSupabase().from('customers').update({ customer_name: input.customerName, logo_url: normalizeCustomerLogoUrl(input.logoUrl), primary_address: input.primaryAddress, default_ship_to_address: input.shipToAddress, default_bill_to_address: input.billToAddress }).eq('id', customerId).eq('organization_id', input.organizationId).select('id').single()
  if (error) throw error
}

function normalizeCustomerLogoUrl(value: string): string | null {
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > 2048) throw new Error('Logo URL must be 2,048 characters or fewer.')
  let url: URL
  try { url = new URL(normalized) }
  catch { throw new Error('Enter a valid HTTPS logo URL.') }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('Enter a valid HTTPS logo URL without embedded credentials.')
  return normalized
}

export async function createSalesOrder(input: SalesOrderInput): Promise<void> {
  const { error } = await requireSupabase().rpc('create_sales_order', {
    p_order: {
      organization_id: input.organizationId, sales_order_name: input.salesOrderName.trim() || null, customer_id: input.customerId,
      customer_name: input.customerName, customer_address: input.customerAddress, customer_po_number: input.customerPoNumber,
      ship_to_address: input.shipToAddress, bill_to_address: input.billToAddress, date_received: input.dateReceived,
      order_due_date: input.orderDueDate, notes: input.notes,
    },
    p_lines: input.lines.map((line) => ({ line_number: line.lineNumber, part_number: line.partNumber, description: line.description, manufactured_item: line.manufacturedItem, pricing_type: line.pricingType, quantity: line.quantity, unit_price: line.unitPrice, flat_rate_amount: line.flatRateAmount, sort_order: line.sortOrder })),
  })
  if (error) throw error
}

export async function addSalesOrderLine(salesOrderId: string, input: SalesOrderLineInput): Promise<void> {
  const { error } = await requireSupabase().rpc('add_sales_order_line', {
    p_sales_order_id: salesOrderId,
    p_line: {
      part_number: input.partNumber,
      description: input.description,
      manufactured_item: input.manufacturedItem,
      pricing_type: input.pricingType,
      quantity: input.quantity,
      unit_price: input.unitPrice,
      flat_rate_amount: input.flatRateAmount,
    },
  })
  if (error) throw error
}

function salesOrderLinePayload(input: SalesOrderLineInput) {
  return {
    part_number: input.partNumber,
    description: input.description,
    manufactured_item: input.manufacturedItem,
    pricing_type: input.pricingType,
    quantity: input.quantity,
    unit_price: input.unitPrice,
    flat_rate_amount: input.flatRateAmount,
  }
}

export async function updateSalesOrderLine(lineId: string, input: SalesOrderLineInput): Promise<void> {
  const { error } = await requireSupabase().rpc('update_sales_order_line', {
    p_line_id: lineId,
    p_line: salesOrderLinePayload(input),
  })
  if (error) throw error
}

export async function setSalesOrderLineArchived(lineId: string, archived: boolean): Promise<void> {
  const { error } = await requireSupabase().rpc('set_sales_order_line_archived', { p_line_id: lineId, p_archived: archived })
  if (error) throw error
}

export async function setSalesOrderArchived(salesOrderId: string, archived: boolean): Promise<void> {
  const { error } = await requireSupabase().rpc('set_sales_order_archived', { p_sales_order_id: salesOrderId, p_archived: archived })
  if (error) throw error
}

export async function setWorkOrderArchived(workOrderId: string, archived: boolean): Promise<void> {
  const { error } = await requireSupabase().rpc('set_work_order_archived', { p_work_order_id: workOrderId, p_archived: archived })
  if (error) throw error
}

export async function markSalesOrderMilestone(salesOrderId: string, milestone: 'shipped' | 'invoiced'): Promise<void> {
  const column = milestone === 'shipped' ? 'shipped_at' : 'invoiced_at'
  const { error } = await requireSupabase()
    .from('sales_orders')
    .update({ [column]: new Date().toISOString() })
    .eq('id', salesOrderId)
    .select('id')
    .single()
  if (error) throw error
}

export async function createWorkOrder(input: WorkOrderInput): Promise<void> {
  const { error } = await requireSupabase().rpc('create_work_order', {
    p_work_order: { organization_id: input.organizationId, work_order_name: input.workOrderName.trim() || null, sales_order_id: input.salesOrderId, sales_order_line_item_id: input.salesOrderLineItemId, part_number: input.partNumber, quantity_ordered: input.quantityOrdered, due_date: input.dueDate, notes: input.notes },
    p_routing: input.routing.map((step) => ({ sequence_number: step.sequenceNumber, routing_step_name: step.name, customer_stage_name: step.customerStageName, work_instructions: step.instructions })),
  })
  if (error) throw error
}
