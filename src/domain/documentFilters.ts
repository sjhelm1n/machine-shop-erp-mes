import type { CustomerDocument, CustomerDocumentType } from './types'

export interface DocumentFilters {
  customerId: string
  salesOrderId: string
  documentType: CustomerDocumentType | ''
}

export function filterDocuments(documents: CustomerDocument[], filters: DocumentFilters): CustomerDocument[] {
  return documents.filter((document) =>
    (!filters.customerId || document.customerId === filters.customerId)
    && (!filters.salesOrderId || document.salesOrderId === filters.salesOrderId)
    && (!filters.documentType || document.documentType === filters.documentType),
  )
}

export const documentTypeLabels: Record<CustomerDocumentType, string> = {
  customer_po: 'Customer PO',
  invoice: 'Invoice',
  drawing: 'Drawing',
  other: 'Other',
}
