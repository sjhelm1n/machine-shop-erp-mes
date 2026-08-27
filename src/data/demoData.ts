import type { ShopData } from '../domain/types'

const orgId = '10000000-0000-0000-0000-000000000001'
const acmeId = '20000000-0000-0000-0000-000000000001'
const northstarId = '20000000-0000-0000-0000-000000000002'

export const demoData: ShopData = {
  organization: { id: orgId, name: 'Northline Machine Co.' },
  customers: [
    { id: acmeId, organizationId: orgId, customerName: 'Acme Motion Systems', primaryAddress: '4800 Industrial Pkwy\nDetroit, MI 48211', defaultShipToAddress: '4800 Industrial Pkwy\nDetroit, MI 48211', defaultBillToAddress: 'PO Box 922\nDetroit, MI 48231' },
    { id: northstarId, organizationId: orgId, customerName: 'Northstar Robotics', primaryAddress: '1190 Innovation Dr\nAnn Arbor, MI 48108', defaultShipToAddress: '1190 Innovation Dr\nAnn Arbor, MI 48108', defaultBillToAddress: '1190 Innovation Dr\nAnn Arbor, MI 48108' },
  ],
  salesOrders: [
    {
      id: 'so-1048', organizationId: orgId, salesOrderNumber: 'SO-1048', customerId: acmeId, customerName: 'Acme Motion Systems', customerAddress: '4800 Industrial Pkwy\nDetroit, MI 48211', customerPoNumber: 'PO-77314', shipToAddress: '4800 Industrial Pkwy\nDetroit, MI 48211', billToAddress: 'PO Box 922\nDetroit, MI 48231', dateReceived: '2026-08-11', orderDueDate: '2026-08-28', notes: 'Certificate of conformance required.',
      lines: [
        { id: 'line-1048-1', salesOrderId: 'so-1048', lineNumber: 1, partNumber: 'ACM-4402', description: 'Drive housing, anodized aluminum', manufacturedItem: true, pricingType: 'per_piece', quantity: 100, unitPrice: 42.5, flatRateAmount: null, lineTotal: 4250, sortOrder: 10 },
        { id: 'line-1048-2', salesOrderId: 'so-1048', lineNumber: 2, partNumber: null, description: 'Expedite fee', manufacturedItem: false, pricingType: 'flat_rate', quantity: 1, unitPrice: null, flatRateAmount: 250, lineTotal: 250, sortOrder: 20 },
      ],
    },
    {
      id: 'so-1051', organizationId: orgId, salesOrderNumber: 'SO-1051', customerId: northstarId, customerName: 'Northstar Robotics', customerAddress: '1190 Innovation Dr\nAnn Arbor, MI 48108', customerPoNumber: 'NS-2026-188', shipToAddress: '1190 Innovation Dr\nAnn Arbor, MI 48108', billToAddress: '1190 Innovation Dr\nAnn Arbor, MI 48108', dateReceived: '2026-08-18', orderDueDate: '2026-09-04', notes: 'Customer pickup when complete.',
      lines: [
        { id: 'line-1051-1', salesOrderId: 'so-1051', lineNumber: 1, partNumber: 'NSR-8810', description: 'Robot wrist spacer', manufacturedItem: true, pricingType: 'per_piece', quantity: 48, unitPrice: 68, flatRateAmount: null, lineTotal: 3264, sortOrder: 10 },
      ],
    },
    {
      id: 'so-1039', organizationId: orgId, salesOrderNumber: 'SO-1039', customerId: acmeId, customerName: 'Acme Motion Systems', customerAddress: '4800 Industrial Pkwy\nDetroit, MI 48211', customerPoNumber: 'PO-76891', shipToAddress: '4800 Industrial Pkwy\nDetroit, MI 48211', billToAddress: 'PO Box 922\nDetroit, MI 48231', dateReceived: '2026-07-21', orderDueDate: '2026-08-15', notes: '',
      lines: [
        { id: 'line-1039-1', salesOrderId: 'so-1039', lineNumber: 1, partNumber: 'ACM-3188', description: 'Motor mount bracket', manufacturedItem: true, pricingType: 'per_piece', quantity: 24, unitPrice: 88, flatRateAmount: null, lineTotal: 2112, sortOrder: 10 },
      ],
    },
  ],
  workOrders: [
    {
      id: 'wo-260824', organizationId: orgId, workOrderNumber: 'WO-260824', salesOrderId: 'so-1048', salesOrderLineItemId: 'line-1048-1', partNumber: 'ACM-4402', quantityOrdered: 100, dueDate: '2026-08-28', releasedAt: '2026-08-12T12:30:00Z', completionDate: null, notes: 'Use material heat AL-6061-84. Protect cosmetic faces.',
      routing: [
        { id: 'step-824-10', workOrderId: 'wo-260824', sequenceNumber: 10, routingStepName: 'Saw', customerStageName: 'In production', workInstructions: 'Cut 1.75 in 6061 bar to 4.25 in blanks. Deburr sharp edges.', workInstructionsRevision: 'A', notes: '' },
        { id: 'step-824-20', workOrderId: 'wo-260824', sequenceNumber: 20, routingStepName: 'CNC Mill · Haas VF-2', customerStageName: 'In production', workInstructions: 'Run OP10 and OP20 per setup sheet SS-4402. Verify first article before continuing.', workInstructionsRevision: 'C', notes: '' },
        { id: 'step-824-30', workOrderId: 'wo-260824', sequenceNumber: 30, routingStepName: 'Deburr', customerStageName: 'Finishing', workInstructions: 'Break edges .005–.015. No visible tool marks on face A.', workInstructionsRevision: null, notes: '' },
        { id: 'step-824-40', workOrderId: 'wo-260824', sequenceNumber: 40, routingStepName: 'Final Inspection', customerStageName: 'Inspection', workInstructions: 'Inspect per drawing ACM-4402 Rev F. Record dimensions 3, 7, and 12.', workInstructionsRevision: 'F', notes: '' },
      ],
    },
    {
      id: 'wo-260831', organizationId: orgId, workOrderNumber: 'WO-260831', salesOrderId: 'so-1051', salesOrderLineItemId: 'line-1051-1', partNumber: 'NSR-8810', quantityOrdered: 48, dueDate: '2026-09-04', releasedAt: '2026-08-19T13:00:00Z', completionDate: null, notes: '',
      routing: [
        { id: 'step-831-10', workOrderId: 'wo-260831', sequenceNumber: 10, routingStepName: 'CNC Lathe', customerStageName: 'In production', workInstructions: 'Turn OD and bore. Maintain concentricity within .0008.', workInstructionsRevision: 'B', notes: '' },
        { id: 'step-831-20', workOrderId: 'wo-260831', sequenceNumber: 20, routingStepName: 'Wash', customerStageName: 'Finishing', workInstructions: 'Aqueous wash and dry. Parts must be free of chips and coolant.', workInstructionsRevision: null, notes: '' },
        { id: 'step-831-30', workOrderId: 'wo-260831', sequenceNumber: 30, routingStepName: 'Final Inspection', customerStageName: 'Inspection', workInstructions: '100% inspect bore diameter.', workInstructionsRevision: 'B', notes: '' },
      ],
    },
    {
      id: 'wo-260796', organizationId: orgId, workOrderNumber: 'WO-260796', salesOrderId: 'so-1039', salesOrderLineItemId: 'line-1039-1', partNumber: 'ACM-3188', quantityOrdered: 24, dueDate: '2026-08-15', releasedAt: '2026-07-22T12:00:00Z', completionDate: '2026-08-13', notes: '',
      routing: [
        { id: 'step-796-10', workOrderId: 'wo-260796', sequenceNumber: 10, routingStepName: 'CNC Mill', customerStageName: 'In production', workInstructions: 'Machine complete per drawing.', workInstructionsRevision: 'D', notes: '' },
        { id: 'step-796-20', workOrderId: 'wo-260796', sequenceNumber: 20, routingStepName: 'Final Inspection', customerStageName: 'Inspection', workInstructions: 'Final inspection per print.', workInstructionsRevision: 'D', notes: '' },
      ],
    },
  ],
  productionEvents: [
    { id: 'ev-1', organizationId: orgId, workOrderId: 'wo-260824', routingStepId: 'step-824-10', eventType: 'release', quantity: 102, fromRoutingStepId: null, toRoutingStepId: 'step-824-10', reversedEventId: null, createdAt: '2026-08-12T12:30:00Z' },
    { id: 'ev-2', organizationId: orgId, workOrderId: 'wo-260824', routingStepId: 'step-824-10', eventType: 'transfer', quantity: 75, fromRoutingStepId: 'step-824-10', toRoutingStepId: 'step-824-20', reversedEventId: null, createdAt: '2026-08-19T14:15:00Z' },
    { id: 'ev-3', organizationId: orgId, workOrderId: 'wo-260824', routingStepId: 'step-824-10', eventType: 'transfer', quantity: 27, fromRoutingStepId: 'step-824-10', toRoutingStepId: 'step-824-20', reversedEventId: null, createdAt: '2026-08-20T13:40:00Z' },
    { id: 'ev-4', organizationId: orgId, workOrderId: 'wo-260824', routingStepId: 'step-824-20', eventType: 'transfer', quantity: 46, fromRoutingStepId: 'step-824-20', toRoutingStepId: 'step-824-30', reversedEventId: null, createdAt: '2026-08-22T16:20:00Z' },
    { id: 'ev-5', organizationId: orgId, workOrderId: 'wo-260824', routingStepId: 'step-824-20', eventType: 'scrap', quantity: 1, fromRoutingStepId: null, toRoutingStepId: null, reversedEventId: null, createdAt: '2026-08-22T16:22:00Z' },
    { id: 'ev-6', organizationId: orgId, workOrderId: 'wo-260824', routingStepId: 'step-824-30', eventType: 'transfer', quantity: 25, fromRoutingStepId: 'step-824-30', toRoutingStepId: 'step-824-40', reversedEventId: null, createdAt: '2026-08-24T15:05:00Z' },
    { id: 'ev-7', organizationId: orgId, workOrderId: 'wo-260824', routingStepId: 'step-824-40', eventType: 'transfer', quantity: 8, fromRoutingStepId: 'step-824-40', toRoutingStepId: null, reversedEventId: null, createdAt: '2026-08-25T14:08:00Z' },
    { id: 'ev-8', organizationId: orgId, workOrderId: 'wo-260831', routingStepId: 'step-831-10', eventType: 'release', quantity: 48, fromRoutingStepId: null, toRoutingStepId: 'step-831-10', reversedEventId: null, createdAt: '2026-08-19T13:00:00Z' },
    { id: 'ev-9', organizationId: orgId, workOrderId: 'wo-260831', routingStepId: 'step-831-10', eventType: 'transfer', quantity: 1, fromRoutingStepId: 'step-831-10', toRoutingStepId: 'step-831-20', reversedEventId: null, createdAt: '2026-08-25T15:02:00Z' },
    { id: 'ev-10', organizationId: orgId, workOrderId: 'wo-260796', routingStepId: 'step-796-10', eventType: 'release', quantity: 24, fromRoutingStepId: null, toRoutingStepId: 'step-796-10', reversedEventId: null, createdAt: '2026-07-22T12:00:00Z' },
    { id: 'ev-11', organizationId: orgId, workOrderId: 'wo-260796', routingStepId: 'step-796-10', eventType: 'transfer', quantity: 24, fromRoutingStepId: 'step-796-10', toRoutingStepId: 'step-796-20', reversedEventId: null, createdAt: '2026-08-11T16:00:00Z' },
    { id: 'ev-12', organizationId: orgId, workOrderId: 'wo-260796', routingStepId: 'step-796-20', eventType: 'transfer', quantity: 24, fromRoutingStepId: 'step-796-20', toRoutingStepId: null, reversedEventId: null, createdAt: '2026-08-13T15:30:00Z' },
  ],
  questions: [
    { id: 'q-1', organizationId: orgId, customerId: acmeId, salesOrderId: 'so-1048', senderType: 'customer', message: 'Can you confirm the first 25 pieces will be ready by Thursday?', createdAt: '2026-08-25T13:12:00Z', readAt: null },
    { id: 'q-2', organizationId: orgId, customerId: northstarId, salesOrderId: 'so-1051', senderType: 'customer', message: 'Please let us know when final inspection begins so we can arrange pickup.', createdAt: '2026-08-24T18:30:00Z', readAt: '2026-08-25T12:00:00Z' },
    { id: 'q-3', organizationId: orgId, customerId: northstarId, salesOrderId: 'so-1051', senderType: 'manufacturer', message: 'Will do. We expect inspection early next week.', createdAt: '2026-08-25T12:04:00Z', readAt: null },
  ],
  invoices: [
    { id: 'inv-1', organizationId: orgId, customerId: acmeId, salesOrderId: 'so-1039', invoiceNumber: 'INV-4382', invoiceDate: '2026-08-14', amount: 2112, filePath: `${orgId}/${acmeId}/INV-4382.pdf`, uploadedAt: '2026-08-14T16:20:00Z' },
  ],
}
