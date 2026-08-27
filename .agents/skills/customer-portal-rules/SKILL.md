---
name: customer-portal-rules
description: Build and review this project's customer-facing portal for order visibility, production progress, order questions, and invoice references. Use when changing customer authentication or navigation, customer-visible order and Work Order data, progress calculations and stage mapping, customer messages, or invoice PDF access. Do not apply these specialized rules to the manufacturer's internal application.
---

# Customer Portal Rules

Use these rules when building or modifying customer-facing functionality. Follow the project's Supabase and security skills for authentication, authorization, RLS, storage security, and secure implementation.

## Core Principle

Provide useful production visibility without exposing unnecessary internal shop-floor detail. Keep the portal simple and customer-focused so customers can answer:

- What orders do I have?
- What has already been completed?
- How far along is my current order?
- When is it due?
- What questions have I asked?
- What invoices are available for reference?

## Customer Authentication and Isolation

- Give each customer user their own login credentials.
- Allow multiple users to belong to the same customer account.
- Permit customer users to access only information belonging to their associated customer.
- Enforce tenant and customer isolation at the database level with Supabase RLS; never rely only on frontend filtering.
- Never expose another customer's Sales Orders, Work Orders, production progress, messages, or invoice documents.

## Navigation

Keep initial navigation limited to:

- Orders
- Questions
- Invoices

Do not expose manufacturer-side modules.

## Orders

Let customers view current and previous orders. Useful Sales Order fields include:

- Sales Order number
- Customer PO number
- Date received
- Order due date
- Completion date when applicable
- Overall production progress

For manufactured items, show useful production information without exposing unnecessary internal routing detail.

### Manufactured Items

Customer-facing information may include:

- Part number
- Quantity ordered
- Percent complete
- Simplified production stage
- Due date
- Completion date

Do not expose by default:

- Specific machine names
- Internal routing sequence
- Internal work instructions
- Scrap details
- Production notes
- Routing timestamps
- Individual production events

## Customer-Facing Production Stages

Map detailed internal routing steps to broader stages such as:

- Order Received
- In Production
- Inspection
- Complete

Use a configurable or maintainable mapping between internal routing steps and customer-facing stages. Do not require every internal step to become a customer-facing stage.

## Percent Complete

Support partial production, batch production, one-piece flow, multiple routing steps, and overproduction. Calculate progress from quantities processed across routing steps, not merely the count of routing steps marked complete.

For ordered quantity `Q` and routing-step count `N`, use this simple baseline:

```text
percent complete = sum(processed quantity across all routing steps) / (Q × N)
```

Cap customer-facing progress at 100 percent. Overproduction must never display progress above 100 percent.

Example: for 100 ordered pieces and four routing steps with processed quantities of 100, 75, 25, and 0, progress is `200 / 400 = 50%`.

If implementation requires refinement to prevent double counting or inconsistent production-event interpretation, preserve the intent: represent physical progress through routing.

### Sales Order Progress

A Sales Order may contain multiple Work Orders. Provide aggregate Sales Order progress using a simple weighted calculation based on ordered quantities unless there is a clear reason to use another approach. Document the calculation in code and keep it understandable. Do not introduce advanced scheduling or earned-value logic.

## Due Dates and ETA

- Show the Work Order and/or Sales Order due date.
- Do not invent automated production ETA functionality unless explicitly requested.
- If a manufacturer-entered ETA is added later, distinguish it clearly from the contractual or committed due date.
- Never infer an ETA from percent complete alone.

## Questions

Provide a lightweight customer Q&A interface, preferably associated with a Sales Order. It should feel like a simple message thread where customers can ask a question, read manufacturer responses, and review prior conversation history.

### Customer Message Restrictions

- Accept plain text only.
- Sanitize input according to project security practices.
- Reject or neutralize text that appears to contain a URL or hyperlink, according to the selected implementation.
- Keep messages focused on order-related questions.
- Do not allow customer file attachments, executable uploads, embedded hyperlinks, HTML, or rich-content embeds.

### Manufacturer Responses

Allow manufacturer users to respond from the manufacturer application. Preserve:

- Message order
- Sender type
- Timestamp
- Sales Order association when present
- Read/unread behavior if implemented

Do not build a full email client.

## Invoice Archive

QuickBooks Online is the financial system of record. This application does not calculate or create invoices.

Allow manufacturer users to upload invoice PDFs for customer reference. Customer-visible metadata may include:

- Invoice number
- Invoice date
- Sales Order association
- Amount when entered
- Uploaded date

Allow customers to list, open, and download their invoice PDFs.

### Invoice Restrictions

- Only manufacturer users may upload invoices.
- Initially support PDF invoices only.
- Do not allow customer invoice uploads or executable files.
- Do not expose internal Supabase Storage paths when secure access is appropriate.
- Enforce customer-specific document access independently of UI visibility.

## Historical Access

Retain customer access to previous Sales Orders, customer-facing Work Order progress history, questions and responses, and invoice PDFs. Do not hide completed orders merely because they are inactive. Provide a straightforward distinction between current and historical orders.

## UX Priorities

Make the portal simpler than the manufacturer application. Prioritize, in order:

1. Clear order visibility
2. Easy understanding of production progress
3. Easy access to questions
4. Easy access to invoices
5. Minimal navigation

Avoid traditional ERP complexity and replace internal implementation terminology with simpler customer language where practical.

## Explicit Exclusions

Do not add these features unless explicitly requested:

- RFQ submission
- CPQ
- Quote acceptance
- Customer file or drawing uploads
- CAD files
- Order-change workflows
- Online payments
- Accounts-receivable management
- Shipping-tracking integrations
- Detailed shop routing
- Machine names
- Scrap visibility
- Operator information
- Production scheduling
- Customer-generated purchase orders
- General support ticketing unrelated to orders

Keep the portal narrowly focused on order visibility, production progress, questions, and invoice reference.
