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

## General Guidance

Use globally installed React, Supabase, security, browser, and verification skills for general technical best practices.

Do not duplicate those global rules in local skills.

When multiple local skills apply, follow all applicable skills.

When instructions conflict, prioritize:

1. Explicit current user request
2. Applicable local project skill
3. This `AGENTS.md`
4. Global technical skills
