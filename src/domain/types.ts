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

export interface RoutingTemplateStep {
  id: string
  routingTemplateId: string
  sequenceNumber: number
  routingStepName: string
  customerStageName: string
  workInstructions: string
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
    questionsHasMore: boolean
    documentsHasMore: boolean
  }
}
