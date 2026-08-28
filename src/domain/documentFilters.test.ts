import { describe, expect, it } from 'vitest'
import type { CustomerDocument } from './types'
import { filterDocuments } from './documentFilters'

const documents: CustomerDocument[] = [
  { id: 'po-a1', organizationId: 'org', customerId: 'customer-a', salesOrderId: 'order-a1', documentType: 'customer_po', documentName: 'PO-A1', documentDate: '2026-08-01', amount: null, filePath: 'a1.pdf', uploadedAt: '2026-08-01T12:00:00Z' },
  { id: 'invoice-a2', organizationId: 'org', customerId: 'customer-a', salesOrderId: 'order-a2', documentType: 'invoice', documentName: 'INV-A2', documentDate: '2026-08-02', amount: 50, filePath: 'a2.pdf', uploadedAt: '2026-08-02T12:00:00Z' },
  { id: 'drawing-b1', organizationId: 'org', customerId: 'customer-b', salesOrderId: 'order-b1', documentType: 'drawing', documentName: 'DRAWING-B1', documentDate: '2026-08-03', amount: null, filePath: 'b1.pdf', uploadedAt: '2026-08-03T12:00:00Z' },
]

describe('filterDocuments', () => {
  it('filters by customer, PO-linked order, and document type', () => {
    expect(filterDocuments(documents, { customerId: 'customer-a', salesOrderId: 'order-a2', documentType: 'invoice' }).map((document) => document.id)).toEqual(['invoice-a2'])
  })

  it('does not cross customer boundaries when filters conflict', () => {
    expect(filterDocuments(documents, { customerId: 'customer-b', salesOrderId: 'order-a1', documentType: '' })).toEqual([])
  })
})
