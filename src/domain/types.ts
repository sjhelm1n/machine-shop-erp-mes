export type AppRole = 'manufacturer' | 'customer'
export type PricingType = 'per_piece' | 'flat_rate'
export type ProductionEventType = 'release' | 'adjustment' | 'transfer' | 'scrap' | 'reversal'
export type CustomerDocumentType = 'customer_po' | 'invoice' | 'drawing' | 'other'

export interface Organization {
  id: string
  name: string
  plantTimezone: string
}

export interface Profile {
  id: string
  organizationId: string
  customerId: string | null
  displayName: string
  role: AppRole
  isSuperAdmin: boolean
}

export interface Customer {
  id: string
  organizationId: string
  customerName: string
  logoUrl: string | null
  emailDomain: string | null
  primaryAddress: string
  defaultShipToAddress: string
  defaultBillToAddress: string
}

export interface SalesOrderLine {
  id: string
  salesOrderId: string
  lineNumber: number
  partNumber: string | null
  description: string
  manufacturedItem: boolean
  pricingType: PricingType
  quantity: number
  unitPrice: number | null
  flatRateAmount: number | null
  lineTotal: number
  sortOrder: number
  archivedAt: string | null
}

export interface SalesOrder {
  id: string
  organizationId: string
  salesOrderNumber: string
  salesOrderName: string
  customerId: string
  customerName: string
  customerAddress: string
  customerPoNumber: string
  shipToAddress: string
  billToAddress: string
  dateReceived: string
  orderDueDate: string
  shippedAt: string | null
  invoicedAt: string | null
  customerCompleted?: boolean
  archivedAt: string | null
  notes: string
  lines: SalesOrderLine[]
}

export interface RoutingStep {
  id: string
  workOrderId: string
  sequenceNumber: number
  routingStepName: string
  customerStageName: string
  workInstructions: string
  notes: string
}

/**
 * Tooling assigned to one operation on a released Work Order.
 *
 * These rows are Work Order facts, not routing-template defaults. Keeping them
 * separate from RoutingStep makes that source boundary explicit for outputs
 * such as the traveler.
 */
export interface WorkOrderOperationTool {
  id: string
  workOrderOperationId: string
  toolAssemblyId: string
  toolAssemblyNumber: string
  toolAssemblyName: string
  toolAssemblyDescription: string
  toolNumber: string
  sequenceNumber: number
  notes: string
  sourceRoutingOperationToolId: string | null
}

export interface RoutingOperationTool {
  id: string
  routingOperationId: string
  toolAssemblyId: string
  toolAssemblyNumber: string
  toolAssemblyName: string
  toolAssemblyDescription: string
  toolNumber: string
  sequenceNumber: number
  notes: string
}

export interface ToolAssembly {
  id: string
  organizationId: string
  assemblyNumber: string
  name: string
  description: string
  quantityCheckedOut: number
  quantityInUse: number
  futureRequirements: number
  usageWarning: boolean
  imagePath: string | null
  imageUrl: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ToolCheckoutTransaction {
  id: string
  organizationId: string
  toolAssemblyId: string
  transactionType: 'CHECK_OUT' | 'CHECK_IN'
  note: string
  actorId: string | null
  actorDisplayName: string
  createdAt: string
}

export interface RoutingTemplateStep {
  id: string
  routingTemplateId: string
  sequenceNumber: number
  routingStepName: string
  customerStageName: string
  workInstructions: string
  tooling?: RoutingOperationTool[]
}

export interface RoutingTemplate {
  id: string
  organizationId: string
  templateName: string
  archivedAt: string | null
  steps: RoutingTemplateStep[]
}

export interface StepMetrics {
  stepId: string
  entered: number
  transferred: number
  scrapped: number
  available: number
  processed: number
  enteredAt: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface WorkOrder {
  id: string
  organizationId: string
  workOrderNumber: string
  workOrderName: string
  salesOrderId: string
  salesOrderLineItemId: string
  partNumber: string
  quantityOrdered: number
  dueDate: string
  releasedAt: string
  completionDate: string | null
  archivedAt: string | null
  notes: string
  routing: RoutingStep[]
  /** Work-order-specific assignments copied from, then independent of, routing defaults. */
  operationTooling?: WorkOrderOperationTool[]
  /** Set-wise database summary for live manufacturer views. */
  stepMetrics?: StepMetrics[]
  /** Customer-safe aggregate supplied by the portal RPC; raw events stay internal. */
  customerProgressPercent?: number
  /** Customer-safe stage supplied by the portal RPC; internal routing stays hidden. */
  customerStageName?: string
}

export interface ProductionEvent {
  id: string
  organizationId: string
  workOrderId: string
  routingStepId: string
  eventType: ProductionEventType
  quantity: number
  fromRoutingStepId: string | null
  toRoutingStepId: string | null
  reversedEventId: string | null
  actorId: string | null
  requestId: string | null
  createdAt: string
}

export interface ProductionStepSnapshot {
  workOrderId: string
  workOrderName: string
  partNumber: string
  archivedAt: string | null
  stepId: string
  sequenceNumber: number
  routingStepName: string
  available: number
  transferred: number
  scrapped: number
  nextStepId: string | null
  nextStepName: string | null
  toolCheckoutRequirements: ProductionToolCheckoutRequirement[]
}

export interface ProductionToolCheckoutRequirement {
  operationRole: 'current' | 'next'
  routingStepId: string
  sequenceNumber: number
  routingStepName: string
  toolAssemblyId: string
  assemblyNumber: string
  toolName: string
  toolDescription: string
  checkedOut: boolean
}

export interface Question {
  id: string
  organizationId: string
  customerId: string
  salesOrderId: string | null
  senderType: AppRole
  senderName: string
  message: string
  createdAt: string
  readAt: string | null
}

export interface CustomerDocument {
  id: string
  organizationId: string
  customerId: string
  salesOrderId: string | null
  documentType: CustomerDocumentType
  documentName: string
  documentDate: string
  amount: number | null
  filePath: string
  uploadedAt: string
}

export interface ShopData {
  organization: Organization
  toolAssemblies: ToolAssembly[]
  toolCheckoutTransactions: ToolCheckoutTransaction[]
  routingTemplates: RoutingTemplate[]
  customers: Customer[]
  salesOrders: SalesOrder[]
  workOrders: WorkOrder[]
  productionEvents: ProductionEvent[]
  questions: Question[]
  documents: CustomerDocument[]
  pageInfo?: {
    limit: number
    customersHasMore: boolean
    salesOrdersHasMore: boolean
    workOrdersHasMore: boolean
    toolsHasMore: boolean
    questionsHasMore: boolean
    documentsHasMore: boolean
  }
}
