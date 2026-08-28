---
name: traveler-qr-output
description: Design and review this project's printable Work Order traveler PDFs and routing-step QR output. Use when changing traveler content, pagination, work-instruction layout, QR URLs, QR scan reliability, PDF generation, or the handoff from paper travelers to mobile production execution. Do not apply these specialized rules to unrelated PDFs or general mobile UI.
---

# Traveler and QR Output

Use these rules when building or modifying the Work Order traveler PDF, routing-step QR codes, or the relationship between the physical traveler and digital production transactions. Apply the global React, Supabase, security, and verification skills for general implementation quality.

## Core Principle

Treat the paper traveler as the primary shop-floor communication method. Use the digital application to capture structured routing transactions.

> Paper communicates the work. Digital captures the flow.

Do not turn the phone interface into a complete digital traveler unless explicitly required.

## Traveler Scope

- Generate a traveler for one Work Order.
- Optimize the output for practical printing, handling, and readability in a small machine shop.
- Keep the document operational and concise.

## Required Header Information

Include:

- Work Order number
- Sales Order number
- Customer name
- Customer purchase order
- Part number
- Quantity
- Due date
- Notes

Make the Work Order number and part number visually prominent.

## Routing Steps

List routing steps in sequence order. For each step, include:

- Sequence number
- Step name
- Work instructions
- A QR code unique to that routing step

Do not add or require a separate work-center master. The routing-step name represents the operation or work center.

## Work Instructions

- Preserve line breaks and multi-line formatting.
- Keep instructions associated with their routing step.
- Do not silently truncate instructions.
- Maintain readability across short and long instruction sets.
- Do not introduce full document control unless explicitly required.

## QR Codes

- Generate a unique QR code for every routing step.
- Encode enough stable information to resolve both the Work Order and routing step.
- Open the correct mobile production page directly after scanning.
- Use stable identifiers rather than mutable names or descriptions.
- Do not include sensitive information in the QR URL.
- Treat the QR code as navigation, not authentication or authorization.
- Require normal application authentication and enforce authorization independently.

## Mobile Handoff

After a scan, focus the phone interface on fast transaction capture. Do not duplicate the entire traveler, full work instructions, Sales Order, customer details, pricing, or administrative data unless explicitly required.

The phone interface may capture:

- Transfer quantities
- One-piece flow
- Batch flow
- Scrap
- Production events

Apply the project's mobile production UX skill to the scanned transaction screen.

## Generation and Data Freshness

- Provide a clear generate or print action.
- Include the generation date and time on the traveler so stale copies can be identified.
- Render current Work Order and routing data at generation time.
- Reflect updated data when the traveler is regenerated.
- Do not introduce elaborate traveler revision control unless explicitly required.

## PDF and Print Quality

Prioritize:

- Readability
- Reliable ordinary-printer output
- QR scan reliability
- Clear routing sequence
- Legible work instructions
- Grayscale-friendly rendering

Avoid:

- Decorative layout that competes with production information
- Tiny text
- Low-resolution QR codes
- Awkward page breaks
- Separating a routing heading from its instructions
- Splitting a QR code across pages
- Toner-heavy backgrounds

## Pagination

- Support multi-page travelers.
- Repeat enough Work Order identification on continuation pages to identify loose pages.
- Keep each routing step and its instructions together where practical.
- Never split a QR code across pages.

## Handwritten Notes

Blank space for shop-floor handwriting is acceptable when useful, but treat handwriting as supplemental. Do not make handwritten notes the structured system record.

## Explicit Exclusions

Do not add any of the following unless explicitly required:

- General document management
- CAD file storage
- Drawing revision or QMS workflows
- Electronic signatures
- Printed operator authentication data
- Scheduling
- Machine-performance tracking
- OEE tracking
- Labor tracking
- Pricing
- Customer portal information
