# Machine Shop ERP/MES

This repository contains a lightweight ERP/MES application for machine shops with fewer than 10 employees.

Repository-specific rules are defined in `.agents/skills/`.

Before making substantial changes, load the applicable local skill or skills.

## Local Skills

### mes-project-conventions

Use for:

- Repository architecture
- TypeScript and Vite project conventions
- Supabase integration choices
- Vercel deployment conventions
- Dependency and abstraction decisions

Path:

`.agents/skills/mes-project-conventions/SKILL.md`

### machine-shop-erp-guardrails

Use for:

- Sales Orders
- Sales Order line items
- Work Orders
- Routing
- Production events
- Partial transfers
- One-piece flow
- Scrap
- Overproduction
- Production timestamps
- QuickBooks scope boundaries

Path:

`.agents/skills/machine-shop-erp-guardrails/SKILL.md`

### mobile-production-ux

Use for:

- QR-driven production execution
- Smartphone routing transactions
- +1 one-piece flow
- Batch transfers
- Scrap entry
- Mobile quantity entry
- Fat-finger prevention
- Undo behavior

Path:

`.agents/skills/mobile-production-ux/SKILL.md`

### traveler-qr-output

Use for:

- Work Order traveler PDFs
- Routing-step QR codes
- Traveler layout and printing
- Work instructions
- QR destination behavior

Path:

`.agents/skills/traveler-qr-output/SKILL.md`

### customer-portal-rules

Use for:

- Customer portal
- Order history
- Customer-facing percent complete
- Customer-facing production stages
- Customer Q&A
- Invoice PDF access
- Customer-visible information boundaries

Path:

`.agents/skills/customer-portal-rules/SKILL.md`

## ERP Platform Contracts

| Task | Skill |
|---|---|
| Stable identities/revisions, posted facts, inventory reconciliation, UOMs, master-data lifecycle | `.agents/skills/erp-domain-invariants/SKILL.md` |
| Public extension surfaces, stable routes/RPCs/template placeholders, compatibility | `.agents/skills/erp-extension-contracts/SKILL.md` |
| Supabase schema changes, migrations, RLS, generated DB types, secure views | `.agents/skills/erp-schema-evolution/SKILL.md` |
| Multi-record writes, posting, quantities/money, status transitions, idempotency | `.agents/skills/erp-data-integrity/SKILL.md` |
| High-volume reads, pagination/search, reports, bulk edits, imports/exports, synchronization | `.agents/skills/erp-data-scale/SKILL.md` |
| Business dates, timestamps, plant timezones, shifts, production dates, recurrence | `.agents/skills/erp-date-time-semantics/SKILL.md` |
| Roles/permissions, RLS boundaries, tenant/company scope, service-role access | `.agents/skills/erp-access-control/SKILL.md` |
| Critical change history, append-only audit data, retention/archive | `.agents/skills/erp-auditability/SKILL.md` |

## Development Memory

Before non-trivial work, read `.ai/lessons.md` for durable project lessons.

After a correction that reveals a reusable rule, add one concise entry using:

`Context -> Problem -> Rule -> Applies to`

## Common Skill Combinations

Sales Orders or Work Orders:

- `mes-project-conventions`
- `machine-shop-erp-guardrails`

QR production execution:

- `mes-project-conventions`
- `machine-shop-erp-guardrails`
- `mobile-production-ux`

Traveler PDF:

- `mes-project-conventions`
- `machine-shop-erp-guardrails`
- `traveler-qr-output`

Customer portal:

- `mes-project-conventions`
- `machine-shop-erp-guardrails`
- `customer-portal-rules`

Data-heavy screens or bulk data movement:

- `mes-project-conventions`
- `erp-data-scale`
- The applicable schema, integrity, access-control, or extension contract skills

Date, time, shift, or production-calendar behavior:

- `mes-project-conventions`
- `machine-shop-erp-guardrails`
- `erp-date-time-semantics`
- The applicable schema, integrity, data-scale, or extension contract skills

## Existing Skills Remain Authoritative

Do not duplicate the existing global React, Supabase, security, browser, or verification skills.

Do not duplicate the existing local project conventions, machine-shop domain, mobile production UX, traveler/QR output, or customer portal skills.

## General Guidance

When multiple local skills apply, follow all applicable skills.

When instructions conflict, prioritize:

1. Explicit current user request
2. Applicable local project skill
3. This `AGENTS.md`
4. Global technical skills
