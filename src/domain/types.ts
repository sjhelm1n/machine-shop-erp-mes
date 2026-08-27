export type AppRole = 'manufacturer' | 'customer'
export type PricingType = 'per_piece' | 'flat_rate'
export type ProductionEventType = 'release' | 'adjustment' | 'transfer' | 'scrap' | 'reversal'

export interface Organization {
  id: string
  name: string
}

export interface Profile {
  id: string
  organizationId: string
  customerId: string | null
  displayName: string
  role: AppRole
}

export interface Customer {
  id: string
  organizationId: string
  customerName: string
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
}

export interface SalesOrder {
  id: string
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
  lines: SalesOrderLine[]
}

export interface RoutingStep {
  id: string
  workOrderId: string
  sequenceNumber: number
  routingStepName: string
  customerStageName: string
  workInstructions: string
  workInstructionsRevision: string | null
  notes: string
}

export interface WorkOrder {
  id: string
  organizationId: string
  workOrderNumber: string
  salesOrderId: string
  salesOrderLineItemId: string
  partNumber: string
  quantityOrdered: number
  dueDate: string
  releasedAt: string
  completionDate: string | null
  notes: string
  routing: RoutingStep[]
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
  createdAt: string
}

export interface Question {
  id: string
  organizationId: string
  customerId: string
  salesOrderId: string | null
  senderType: AppRole
  message: string
  createdAt: string
  readAt: string | null
}

export interface Invoice {
  id: string
  organizationId: string
  customerId: string
  salesOrderId: string | null
  invoiceNumber: string
  invoiceDate: string
  amount: number | null
  filePath: string
  uploadedAt: string
}

export interface ShopData {
  organization: Organization
  customers: Customer[]
  salesOrders: SalesOrder[]
  workOrders: WorkOrder[]
  productionEvents: ProductionEvent[]
  questions: Question[]
  invoices: Invoice[]
}
