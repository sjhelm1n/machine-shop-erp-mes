---
name: erp-data-scale
description: Design and review ShopCore data access for production-scale lists, dashboards, search, reports, inventory and production views, bulk edits, data synchronization, and safe repeatable CSV imports or exports.
---

# ERP Data Scale

Use this skill for list pages, dashboards, search, reports, inventory views, production screens, large datasets, CSV imports or exports, bulk edits, migration utilities, and data synchronization.

## Goal

Design ShopCore data access for realistic production volume rather than an empty development database, while keeping bulk operations safe, authorized, and repeatable.

## Query Design

1. **Never query once per displayed row.**
   - Collect related identifiers and fetch set-wise.
   - Prefer joins or embedded relations, a view, or an existing Supabase RPC when appropriate.
   - `Promise.all()` over many database calls is still N+1.

2. **Paginate growing operational datasets.**
   - Orders, jobs, inventory transactions, audit or history records, and similar datasets must not be loaded wholesale into the browser.
   - Use bounded page sizes and stable ordering.
   - Full fetches are appropriate only for genuinely small reference sets.

3. **Select only what the screen needs.**
   - Avoid broad `select('*')` calls on high-traffic lists and reports.
   - Do not pull large JSON, text, or document fields into rows that do not display them.

4. **Use exact counts only when exactness is a business requirement.**
   - Accounting, reconciliation, and control totals may require exact counts.
   - Routine pagination or approximate UI totals generally do not justify an expensive exact count.

5. **Push expensive aggregation to Postgres when it reduces round trips or transferred data.**
   - Use views or RPCs for real multi-table summaries or repeated calculations.
   - Do not move simple CRUD to SQL purely for architectural style.

6. **Index actual access paths.**
   - Index common company or tenant filters, foreign-key joins, selective filters, and frequent sort patterns where justified.
   - Do not create speculative indexes without an access pattern.

7. **Keep interactive search bounded.**
   - Debounce where appropriate.
   - Avoid broad searches on every keystroke.
   - Ignore or cancel stale responses so older requests cannot overwrite newer results.

8. **Measure before adding complexity.**
   - Test representative row counts.
   - Inspect the slow path before adding caches, projections, or special read models.
   - Reuse existing ShopCore caching and query behavior when present; do not add another cache tier solely for this skill.

## Derived Read Models

A derived read model may be appropriate for an expensive, frequently viewed summary only when:

- Source transactional records remain authoritative.
- The derived state can be rebuilt and reconciled.
- Updates are reliably connected to source changes.
- Measured query cost justifies the additional complexity.

Do not introduce a message queue, background-job framework, or event platform solely to create a read model.

## Import Workflow

Prefer this staged workflow:

1. Parse or upload the source data.
2. Preview columns and representative rows.
3. Map source fields to ShopCore fields.
4. Validate types, required fields, references, enums, units, dates, and quantities.
5. Classify each row as insert, update, skip, or error.
6. Execute through the trusted existing application or database boundary.
7. Return inserted, updated, skipped, and error counts with actionable row-level feedback.

Apply these invariants:

- Re-running the same source must not silently duplicate business records.
- Prefer durable external IDs when the source system provides them.
- Natural-key matching must mirror actual database uniqueness, including company scope and normalization rules.
- Avoid weak name-only matching where domain identity is composite.
- Parent and child data may require multiple passes; explicitly detect unresolved references, self-reference, and cycles.
- Validate again at the trusted execution boundary even when the browser already validated.
- Do not silently coerce invalid dates, quantities, prices, units, enums, or identifiers.
- Choose batch atomicity deliberately: use all-or-nothing when the batch is one business transaction, and per-row or per-entity execution when independent records may validly succeed separately.

## Export Rules

- Export only data the user is authorized to view under existing ShopCore security rules.
- Export the same filters and scope the user expects from the current view or requested dataset.
- Use stable field names and explicit formatting for identifiers, dates, money, quantities, units, and booleans.
- Do not make external exports depend on incidental UI-only fields.

## Related ERP Contracts

Follow all applicable project skills in addition to this one:

- Use `erp-schema-evolution` when adding or changing indexes, views, RPCs, or derived persistence.
- Use `erp-data-integrity` for bulk writes, transaction boundaries, quantities, money, and idempotency.
- Use `erp-access-control` for tenant or company scope, RLS, privileged execution, and exported data.
- Use `erp-extension-contracts` when import or export fields, RPC contracts, or synchronization identifiers are stable external surfaces.

## Review Checklist

- Could this dataset be 10x or 100x larger later?
- Is any database request being made once per row?
- Is the list bounded and paginated with stable ordering?
- Are only required columns selected?
- Is an exact count truly necessary?
- Are common filters, joins, and sorts appropriately indexed?
- Could a view or RPC eliminate repeated round trips or client aggregation?
- Is search bounded and protected from stale responses?
- Was performance tested with representative data?
- Can an import be safely re-run?
- Does matching mirror database identity and uniqueness?
- Are row-level errors actionable?
- Is the transaction scope appropriate for the bulk operation?

## ShopCore-Specific Constraint

Use ShopCore's existing React, TypeScript, Supabase/Postgres, Vite, and Vercel patterns. Do not add query libraries, caches, CSV frameworks, queues, background-job platforms, or other infrastructure solely to satisfy this skill.
