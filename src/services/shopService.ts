import type { AppRole, CustomerDocument, PricingType, ProductionEvent, ProductionStepSnapshot, Question, ShopData, StepMetrics } from '../domain/types'
import { parseProductionEvent, parseProductionStepSnapshot } from '../domain/databaseValidation'
import { parseDashboardMetrics, type DashboardMetrics, type DashboardRange } from '../domain/dashboard'
import { validateDocumentPdf } from '../domain/documentSecurity'
import { requireSupabase } from '../lib/supabase'
import type { Database, Tables } from '../types/database.generated'

type CustomerDocumentRow = Pick<Tables<'customer_documents'>, 'id' | 'organization_id' | 'customer_id' | 'sales_order_id' | 'document_type' | 'document_name' | 'document_date' | 'amount' | 'file_path' | 'uploaded_at'>
type PortalSalesOrderRow = Database['public']['Functions']['customer_portal_sales_orders']['Returns'][number]
type PortalLineRow = Database['public']['Functions']['customer_portal_sales_order_lines']['Returns'][number]
type PortalWorkOrderRow = Database['public']['Functions']['customer_portal_work_orders']['Returns'][number]
type RecordProductionEventV2Args = Database['public']['Functions']['record_production_event_v2']['Args']
type WorkOrderStepMetricRow = Database['public']['Functions']['work_order_step_metrics']['Returns'][number]
type DashboardMetricArgs = Database['public']['Functions']['dashboard_metrics']['Args']

const DEFAULT_DATA_LIMIT = 100

function groupedBy<T, K>(rows: T[], keyFor: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const row of rows) {
    const key = keyFor(row)
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return groups
}

function bounded<T>(rows: T[] | null, limit: number): { rows: T[]; hasMore: boolean } {
  const values = rows ?? []
  return { rows: values.slice(0, limit), hasMore: values.length > limit }
}

function productionEventArgs(input: { workOrderId: string; routingStepId: string; eventType: string; quantity: number; toRoutingStepId?: string | null; requestId: string }): RecordProductionEventV2Args {
  // Postgres accepts NULL for this UUID input, but generated RPC argument types do not
  // encode input nullability. Keep the narrow cast at this database boundary.
  return {
    p_work_order_id: input.workOrderId,
    p_routing_step_id: input.routingStepId,
    p_event_type: input.eventType,
    p_quantity: input.quantity,
    p_to_routing_step_id: input.toRoutingStepId ?? null,
    p_request_id: input.requestId,
  } as RecordProductionEventV2Args
}

function pricingType(value: string): PricingType {
  if (value !== 'per_piece' && value !== 'flat_rate') throw new Error('Database contract field pricing_type is unsupported.')
  return value
}

function senderType(value: string): AppRole {
  if (value !== 'manufacturer' && value !== 'customer') throw new Error('Database contract field sender_type is unsupported.')
  return value
}

export async function loadShopData(role: AppRole, limit = DEFAULT_DATA_LIMIT): Promise<ShopData> {
  if (role === 'customer') return loadCustomerPortalData(limit)
  const client = requireSupabase()
  const [organization, templatesResult, customersResult, salesOrdersResult, workOrdersResult, questionsResult, documentsResult] = await Promise.all([
    client.from('organizations').select('id, name, plant_timezone').single(),
    client.from('routing_templates').select('id, organization_id, template_name, archived_at').order('template_name').order('id'),
    client.from('customers').select('id, organization_id, customer_name, logo_url, primary_address, default_ship_to_address, default_bill_to_address').order('customer_name').order('id').limit(limit + 1),
    client.from('sales_orders').select('id, organization_id, sales_order_number, sales_order_name, customer_id, customer_name, customer_address, customer_po_number, ship_to_address, bill_to_address, date_received, order_due_date, shipped_at, invoiced_at, archived_at, notes').order('date_received', { ascending: false }).order('id', { ascending: false }).limit(limit + 1),
    client.from('work_orders').select('id, organization_id, work_order_number, work_order_name, sales_order_id, sales_order_line_item_id, part_number, quantity_ordered, due_date, released_at, completion_date, archived_at, notes').order('due_date').order('id').limit(limit + 1),
    client.from('customer_messages').select('id, organization_id, customer_id, sales_order_id, sender_type, message, created_at, read_at').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1),
    client.from('customer_documents').select('id, organization_id, customer_id, sales_order_id, document_type, document_name, document_date, amount, file_path, uploaded_at').order('document_date', { ascending: false }).order('id', { ascending: false }).limit(limit + 1),
  ])
  const firstError = [organization, templatesResult, customersResult, salesOrdersResult, workOrdersResult, questionsResult, documentsResult].find((result) => result.error)?.error
  if (firstError) throw firstError
  if (!organization.data) throw new Error('No accessible organization was found for this user.')

  const customers = bounded(customersResult.data, limit)
  const salesOrders = bounded(salesOrdersResult.data, limit)
  const workOrders = bounded(workOrdersResult.data, limit)
  const questions = bounded(questionsResult.data, limit)
  const documents = bounded(documentsResult.data, limit)
  const salesOrderIds = salesOrders.rows.map((row) => row.id)
  const workOrderIds = workOrders.rows.map((row) => row.id)
  const routingTemplateIds = (templatesResult.data ?? []).map((row) => row.id)
  const [linesResult, routingResult, metricsResult, templateStepsResult] = await Promise.all([
    salesOrderIds.length
      ? client.from('sales_order_line_items').select('id, sales_order_id, line_number, part_number, description, manufactured_item, pricing_type, quantity, unit_price, flat_rate_amount, line_total, sort_order, archived_at').in('sales_order_id', salesOrderIds).order('sales_order_id').order('sort_order').order('id')
      : Promise.resolve({ data: [], error: null }),
    workOrderIds.length
      ? client.from('routing_steps').select('id, work_order_id, sequence_number, routing_step_name, customer_stage_name, work_instructions, notes').in('work_order_id', workOrderIds).order('work_order_id').order('sequence_number').order('id')
      : Promise.resolve({ data: [], error: null }),
    workOrderIds.length
      ? client.rpc('work_order_step_metrics', { p_work_order_ids: workOrderIds })
      : Promise.resolve({ data: [], error: null }),
    routingTemplateIds.length
      ? client.from('routing_template_steps').select('id, routing_template_id, sequence_number, routing_step_name, customer_stage_name, work_instructions').in('routing_template_id', routingTemplateIds).order('routing_template_id').order('sequence_number').order('id')
      : Promise.resolve({ data: [], error: null }),
  ])
  const dependencyError = [linesResult, routingResult, metricsResult, templateStepsResult].find((result) => result.error)?.error
  if (dependencyError) throw dependencyError

  const linesByOrder = groupedBy(linesResult.data ?? [], (row) => row.sales_order_id)
  const routingByWorkOrder = groupedBy(routingResult.data ?? [], (row) => row.work_order_id)
  const stepsByTemplate = groupedBy(templateStepsResult.data ?? [], (row) => row.routing_template_id)
  const metricsByWorkOrder = groupedBy(metricsResult.data as WorkOrderStepMetricRow[] | null ?? [], (row) => row.work_order_id)
  const mapMetric = (row: WorkOrderStepMetricRow): StepMetrics => ({
    stepId: row.step_id,
    entered: row.entered,
    transferred: row.transferred,
    scrapped: row.scrapped,
    available: row.available,
    processed: row.processed,
    enteredAt: row.entered_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  })
  return {
    organization: { id: organization.data.id, name: organization.data.name, plantTimezone: organization.data.plant_timezone },
    routingTemplates: (templatesResult.data ?? []).map((template) => ({ id: template.id, organizationId: template.organization_id, templateName: template.template_name, archivedAt: template.archived_at, steps: (stepsByTemplate.get(template.id) ?? []).map((step) => ({ id: step.id, routingTemplateId: step.routing_template_id, sequenceNumber: step.sequence_number, routingStepName: step.routing_step_name, customerStageName: step.customer_stage_name, workInstructions: step.work_instructions })) })),
    customers: customers.rows.map((row) => ({ id: row.id, organizationId: row.organization_id, customerName: row.customer_name, logoUrl: row.logo_url, primaryAddress: row.primary_address, defaultShipToAddress: row.default_ship_to_address, defaultBillToAddress: row.default_bill_to_address })),
    salesOrders: salesOrders.rows.map((row) => ({ id: row.id, organizationId: row.organization_id, salesOrderNumber: row.sales_order_number, salesOrderName: row.sales_order_name, customerId: row.customer_id, customerName: row.customer_name, customerAddress: row.customer_address, customerPoNumber: row.customer_po_number, shipToAddress: row.ship_to_address, billToAddress: row.bill_to_address, dateReceived: row.date_received, orderDueDate: row.order_due_date, shippedAt: row.shipped_at, invoicedAt: row.invoiced_at, archivedAt: row.archived_at, notes: row.notes, lines: (linesByOrder.get(row.id) ?? []).map((line) => ({ id: line.id, salesOrderId: line.sales_order_id, lineNumber: line.line_number, partNumber: line.part_number, description: line.description, manufacturedItem: line.manufactured_item, pricingType: pricingType(line.pricing_type), quantity: line.quantity, unitPrice: line.unit_price, flatRateAmount: line.flat_rate_amount, lineTotal: line.line_total ?? 0, sortOrder: line.sort_order, archivedAt: line.archived_at })) })),
    workOrders: workOrders.rows.map((row) => ({ id: row.id, organizationId: row.organization_id, workOrderNumber: row.work_order_number, workOrderName: row.work_order_name, salesOrderId: row.sales_order_id, salesOrderLineItemId: row.sales_order_line_item_id, partNumber: row.part_number, quantityOrdered: row.quantity_ordered, dueDate: row.due_date, releasedAt: row.released_at, completionDate: row.completion_date, archivedAt: row.archived_at, notes: row.notes, routing: (routingByWorkOrder.get(row.id) ?? []).map((step) => ({ id: step.id, workOrderId: step.work_order_id, sequenceNumber: step.sequence_number, routingStepName: step.routing_step_name, customerStageName: step.customer_stage_name, workInstructions: step.work_instructions, notes: step.notes })), stepMetrics: (metricsByWorkOrder.get(row.id) ?? []).map(mapMetric) })),
    productionEvents: [],
    questions: [...questions.rows].reverse().map((row) => ({ id: row.id, organizationId: row.organization_id, customerId: row.customer_id, salesOrderId: row.sales_order_id, senderType: senderType(row.sender_type), message: row.message, createdAt: row.created_at, readAt: row.read_at })),
    documents: documents.rows.map(mapCustomerDocument),
    pageInfo: { limit, customersHasMore: customers.hasMore, salesOrdersHasMore: salesOrders.hasMore, workOrdersHasMore: workOrders.hasMore, questionsHasMore: questions.hasMore, documentsHasMore: documents.hasMore },
  }
}

async function loadCustomerPortalData(limit: number): Promise<ShopData> {
  const client = requireSupabase()
  const [organization, customers, salesOrders, lines, workOrders, questions, documents] = await Promise.all([
    client.from('organizations').select('id, name, plant_timezone').single(),
    client.from('customers').select('id, organization_id, customer_name').single(),
    client.rpc('customer_portal_sales_orders'),
    client.rpc('customer_portal_sales_order_lines'),
    client.rpc('customer_portal_work_orders'),
    client.from('customer_messages').select('id, organization_id, customer_id, sales_order_id, sender_type, message, created_at, read_at').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1),
    client.from('customer_documents').select('id, organization_id, customer_id, sales_order_id, document_type, document_name, document_date, amount, file_path, uploaded_at').order('document_date', { ascending: false }).order('id', { ascending: false }).limit(limit + 1),
  ])
  const firstError = [organization, customers, salesOrders, lines, workOrders, questions, documents]
    .find((result) => result.error)?.error
  if (firstError) throw firstError
  if (!organization.data) throw new Error('No accessible organization was found for this user.')

  const lineRowsByOrder = groupedBy(lines.data as PortalLineRow[] | null ?? [], (row) => row.sales_order_id)
  const questionPage = bounded(questions.data, limit)
  const documentPage = bounded(documents.data, limit)
  return {
    organization: { id: organization.data.id, name: organization.data.name, plantTimezone: organization.data.plant_timezone },
    routingTemplates: [],
    customers: customers.data ? [{
      id: String(customers.data.id),
      organizationId: String(customers.data.organization_id),
      customerName: String(customers.data.customer_name),
      logoUrl: null,
      primaryAddress: '',
      defaultShipToAddress: '',
      defaultBillToAddress: '',
    }] : [],
    salesOrders: (salesOrders.data as PortalSalesOrderRow[] | null ?? []).map((row) => ({
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
      lines: (lineRowsByOrder.get(row.id) ?? []).map((line) => ({
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
    workOrders: (workOrders.data as PortalWorkOrderRow[] | null ?? []).map((row) => ({
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
    questions: [...questionPage.rows].reverse().map((row) => ({ id: row.id, organizationId: row.organization_id, customerId: row.customer_id, salesOrderId: row.sales_order_id, senderType: senderType(row.sender_type), message: row.message, createdAt: row.created_at, readAt: row.read_at })),
    documents: documentPage.rows.map(mapCustomerDocument),
    pageInfo: { limit, customersHasMore: false, salesOrdersHasMore: false, workOrdersHasMore: false, questionsHasMore: questionPage.hasMore, documentsHasMore: documentPage.hasMore },
  }
}

export async function loadProductionStep(workOrderId: string, routingStepId: string): Promise<ProductionStepSnapshot> {
  const { data, error } = await requireSupabase().rpc('production_step_snapshot', {
    p_work_order_id: workOrderId,
    p_routing_step_id: routingStepId,
  }).single()
  if (error) throw error
  return parseProductionStepSnapshot(data)
}

export async function loadDashboardMetrics(range: DashboardRange): Promise<DashboardMetrics> {
  const params: DashboardMetricArgs = { p_bucket: 'day' }
  if (range.startDate) params.p_start_date = range.startDate
  if (range.endDate) params.p_end_date = range.endDate
  const { data, error } = await requireSupabase().rpc('dashboard_metrics', params)
  if (error) throw error
  return parseDashboardMetrics(data)
}

export async function recordProductionEvent(input: { workOrderId: string; routingStepId: string; eventType: 'transfer' | 'scrap'; quantity: number; toRoutingStepId?: string | null; requestId: string }): Promise<ProductionEvent> {
  const { data, error } = await requireSupabase().rpc('record_production_event_v2', productionEventArgs(input)).single()
  if (error) throw error
  return parseProductionEvent(data)
}

export async function reverseProductionEvent(eventId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('reverse_production_event', { p_event_id: eventId })
  if (error) throw error
}

export async function recordProductionAdjustment(input: { workOrderId: string; routingStepId: string; quantity: number; requestId: string }): Promise<void> {
  const { error } = await requireSupabase().rpc('record_production_event_v2', productionEventArgs({ ...input, eventType: 'adjustment' }))
  if (error) throw error
}

export async function sendQuestion(input: Omit<Question, 'id' | 'createdAt' | 'readAt'>): Promise<void> {
  const { error } = await requireSupabase().from('customer_messages').insert({ organization_id: input.organizationId, customer_id: input.customerId, sales_order_id: input.salesOrderId, sender_type: input.senderType, message: input.message })
  if (error) throw error
}

function mapCustomerDocument(row: CustomerDocumentRow): CustomerDocument {
  return {
    id: row.id,
    organizationId: row.organization_id,
    customerId: row.customer_id,
    salesOrderId: row.sales_order_id,
    documentType: row.document_type,
    documentName: row.document_name,
    documentDate: row.document_date,
    amount: row.amount,
    filePath: row.file_path,
    uploadedAt: row.uploaded_at,
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
    const cleanup = await client.storage.from('invoices').remove([filePath])
    if (cleanup.error) throw new Error(`Document metadata failed and the uploaded object could not be cleaned up: ${metadata.error.message}; cleanup: ${cleanup.error.message}`)
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

export interface WorkOrderUpdateInput {
  workOrderId: string
  dueDate: string
  notes: string
  routing: Array<{ id: string; name: string; customerStageName: string; instructions: string }>
}

export interface RoutingTemplateInput {
  id: string
  organizationId: string
  templateName: string
  steps: Array<{ name: string; customerStageName: string; instructions: string }>
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

export async function createSalesOrder(input: SalesOrderInput, requestId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('create_sales_order', {
    p_order: {
      organization_id: input.organizationId, request_id: requestId, sales_order_name: input.salesOrderName.trim() || null, customer_id: input.customerId,
      customer_name: input.customerName, customer_address: input.customerAddress, customer_po_number: input.customerPoNumber,
      ship_to_address: input.shipToAddress, bill_to_address: input.billToAddress, date_received: input.dateReceived,
      order_due_date: input.orderDueDate, notes: input.notes,
    },
    p_lines: input.lines.map((line) => ({ line_number: line.lineNumber, part_number: line.partNumber, description: line.description, manufactured_item: line.manufacturedItem, pricing_type: line.pricingType, quantity: line.quantity, unit_price: line.unitPrice, flat_rate_amount: line.flatRateAmount, sort_order: line.sortOrder })),
  })
  if (error) throw error
}

export async function addSalesOrderLine(salesOrderId: string, input: SalesOrderLineInput, requestId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('add_sales_order_line', {
    p_sales_order_id: salesOrderId,
    p_line: {
      request_id: requestId,
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

export async function markSalesOrderMilestone(salesOrderId: string, milestone: 'shipped' | 'invoiced'): Promise<string> {
  const { data, error } = await requireSupabase().rpc('mark_sales_order_milestone', {
    p_sales_order_id: salesOrderId,
    p_milestone: milestone,
  })
  if (error) throw error
  if (!data) throw new Error('The sales-order milestone was saved without a confirmation timestamp.')
  return data
}

export async function createWorkOrder(input: WorkOrderInput, requestId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('create_work_order', {
    p_work_order: { organization_id: input.organizationId, request_id: requestId, work_order_name: input.workOrderName.trim() || null, sales_order_id: input.salesOrderId, sales_order_line_item_id: input.salesOrderLineItemId, part_number: input.partNumber, quantity_ordered: input.quantityOrdered, due_date: input.dueDate, notes: input.notes },
    p_routing: input.routing.map((step) => ({ sequence_number: step.sequenceNumber, routing_step_name: step.name, customer_stage_name: step.customerStageName, work_instructions: step.instructions })),
  })
  if (error) throw error
}

export async function updateWorkOrder(input: WorkOrderUpdateInput): Promise<void> {
  const { error } = await requireSupabase().rpc('update_work_order', {
    p_work_order_id: input.workOrderId,
    p_due_date: input.dueDate,
    p_notes: input.notes,
    p_routing: input.routing.map((step) => ({ id: step.id, routing_step_name: step.name, customer_stage_name: step.customerStageName, work_instructions: step.instructions })),
  })
  if (error) throw error
}

export async function saveRoutingTemplate(input: RoutingTemplateInput): Promise<void> {
  const { error } = await requireSupabase().rpc('save_routing_template', {
    p_template_id: input.id,
    p_organization_id: input.organizationId,
    p_template_name: input.templateName,
    p_steps: input.steps.map((step) => ({ routing_step_name: step.name, customer_stage_name: step.customerStageName, work_instructions: step.instructions })),
  })
  if (error) throw error
}

export async function setRoutingTemplateArchived(templateId: string, archived: boolean): Promise<void> {
  const { error } = await requireSupabase().rpc('set_routing_template_archived', { p_template_id: templateId, p_archived: archived })
  if (error) throw error
}
