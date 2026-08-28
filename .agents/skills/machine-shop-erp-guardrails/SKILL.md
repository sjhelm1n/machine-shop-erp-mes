---
name: machine-shop-erp-guardrails
description: Apply the authoritative product boundaries and domain rules for this lightweight machine-shop ERP/MES. Use when planning, designing, implementing, reviewing, or testing features, schemas, policies, calculations, traveler PDFs, mobile production flows, customer access, or QuickBooks integration in this repository.
---

# Machine Shop MES Domain Rules

This application is a very lightweight ERP/MES for machine shops with fewer than 10 employees.

Keep the product intentionally narrow. Never add ERP or MES functionality without an explicit requirement.

## Product Boundary

The application begins after a customer Purchase Order is received.

Do not build:

- RFQ management
- CPQ
- Quoting
- Estimating
- Purchasing
- Receiving
- Inventory management
- MRP
- Scheduling
- Capacity planning
- AR
- AP
- General ledger
- Payroll
- Shipping integrations
- CRM
- QMS
- Maintenance
- OEE
- Operator-performance tracking

QuickBooks Online remains the system of record for:

- Invoicing
- AR
- AP
- Inventory

Shipping is handled externally through customer pickup, UPS, FedEx, or another 3PL.

## Sales Orders

A Sales Order only exists after a customer PO is received.

Sales Order header includes:

- Customer name
- Customer address
- Sales Order number
- Sales Order name
- Customer PO number
- Ship-to address
- Bill-to address
- Date received
- Order due date
- Shipment confirmation timestamp
- Invoice confirmation timestamp
- Notes

Sales Orders contain:

- Pricing line items
- Work Orders

Pricing line items may be:

- Per-piece
- Flat-rate

Example flat-rate line:

- Expedite fee

A Sales Order line marked as a manufactured item may create one or more Work Orders.

A Sales Order is complete only when:

- Production progress is 100 percent
- The manufacturer has marked the externally handled shipment complete
- The manufacturer has confirmed the customer was invoiced in QuickBooks Online

Keep these as independent conditions. Do not infer shipping or invoicing from production completion, and do not add shipping-carrier or accounting integrations without an explicit request.

## Work Orders

Work Order fields include:

- WO number
- WO name
- Sales Order
- Sales Order line
- Part number
- Quantity ordered
- Due date
- Created date
- Completion date
- Notes

Do not add:

- Priority
- Operator
- Manual status
- Scheduling fields

## Routing

A Work Order contains ordered routing steps.

The routing step itself represents the operation or work-center concept.

Do not create a separate work-center master unless explicitly requested.

Routing step fields include:

- Sequence number
- Routing step name
- Work instructions
- Notes

## Production Execution

Production must support:

- Batch flow
- Partial transfers
- One-piece flow
- Scrap
- Overproduction

Scrap reduces the quantity flowing forward.

Overproduction is allowed.

Example:

- WO ordered quantity = 100
- First routing step produces 102
- 102 may flow forward

Do not restrict production quantities to the Work Order ordered quantity.

The next routing step defaults to the next routing step in sequence.

## Production Events

Use append-only production events.

Important events include:

- Transfer
- Scrap

Do not overwrite production history.

Quantities at routing steps should be derived from event history where practical.

## Event-Driven Timestamps

Operators should not manually press Start or Complete.

Derive timestamps from activity.

Entered At:

- First quantity arrives at the routing step.

Started At:

- First production-related event occurs at the routing step.

Completed At:

- Routing step has no remaining quantity and no more upstream quantity is expected.

Avoid redundant status fields when state can be inferred.

## Traveler PDF

The paper Work Order traveler is the primary shop-floor communication medium.

The digital application captures routing history.

Core principle:

Paper communicates the work. Digital captures the flow.

Traveler should include:

- WO number
- SO number
- Customer
- Customer PO
- Part number
- Quantity ordered
- Due date
- Work Order notes
- Routing steps
- Work instructions
- QR code for each routing step
- Traveler generation timestamp

## Smartphone Production UX

Assume shop employees have smartphones.

Each routing-step QR code opens a mobile production screen for that routing step.

The interaction must be very fast.

Primary controls:

- +1 →
- Transfer Qty
- Scrap Qty
- Transfer All Available when appropriate

Design goals:

- One-piece flow should be: scan → +1 → done
- Large touch targets
- Numeric keypad for quantities
- Minimal typing
- Avoid dropdowns
- Avoid small controls
- Avoid unnecessary confirmations
- Protect scrap actions from accidental entry
- Allow a short Undo action when practical

## Customer Portal

Each customer has their own login credentials.

Customers may see:

- Current Sales Orders
- Historical Sales Orders
- Part number
- Quantity ordered
- Due date
- Completion date
- Percent complete
- Simplified customer-facing production stage
- Questions and responses
- Historical invoice PDFs

Do not expose unnecessary internal routing detail.

Internal routing may be mapped to broader external stages such as:

- Order Received
- In Production
- Inspection
- Complete

## Customer Data Isolation

- Enforce tenant and customer isolation in Supabase with Row Level Security on every customer-owned table.
- Derive access from authenticated identity and trusted database relationships. Never rely on frontend filtering for authorization.
- Ensure related tables cannot bypass isolation through indirect identifiers or joins.
- Verify that one customer cannot read or mutate another customer's orders, messages, invoices, or related records.

## Percent Complete

Percent complete should account for partial routing progress.

For a Work Order with quantity Q and N routing steps:

Percent Complete =
sum of processed quantity across routing steps /
(Q × N)

Cap customer-facing progress at 100%.

Do not let overproduction produce customer progress above 100%.

## Customer Q&A

Provide lightweight order-linked chat.

Customer messages must be:

- Plain text
- No attachments
- No executable files
- No embedded hyperlinks

Preserve the conversation history.

## Invoice Archive

Invoices are generated in QuickBooks Online.

The manufacturer may upload invoice PDFs for later customer reference.

Customers may only access invoices belonging to their customer account.

Do not generate invoices inside this application.
