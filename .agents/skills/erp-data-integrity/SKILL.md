---
name: erp-data-integrity
description: Protect transactional and quantitative integrity in ShopCore ERP, especially multi-record posting, inventory, quantities, pricing, status transitions, and other business-critical writes.
---

# ERP Data Integrity

Use this skill when a feature writes multiple related records, changes quantities or money, posts business transactions, changes workflow status, or derives totals from child records.

## Goal

Prevent partial writes, duplicate posting, rounding drift, invalid state transitions, and UI-only business rules from corrupting ERP data.

## Contract Ownership

This skill defines **how business-critical writes execute safely**. Use `erp-domain-invariants` to determine what identities, revisions, posted facts, inventory relationships, units, and historical references the operation must preserve. Use `erp-schema-evolution` when implementing the required constraints, tables, views, or RPCs.

Audit logging does not authorize a mutation. When an operation touches a posted business fact, follow `erp-domain-invariants`: preserve the original event and use an explicit reversal, return, adjustment, or correction when needed.

## Atomicity

1. **Do not describe multiple Supabase client writes as a transaction.**
   - Separate client requests can partially succeed.

2. **When all-or-nothing behavior is required, put the operation in PostgreSQL.**
   - Use a Supabase RPC/Postgres function or another existing server-side database operation that can run in a real database transaction.
   - Keep the transaction boundary around the smallest complete business operation.

3. **Examples that usually require an atomic boundary:**
   - Posting an inventory movement and updating its source document.
   - Creating a work order plus required operation/line records when partial creation is invalid.
   - Applying a receipt/shipment and updating remaining quantities.
   - Converting/accepting a quote when several dependent records must move together.
   - Finalizing a document where status and ledger-like rows must agree.

## Idempotency

- Any action that may be retried by a user, browser, network, or server should be safe against duplicate posting.
- Prefer a durable business key, unique constraint, or idempotency token for operations where duplicates would create inventory, financial, or production errors.
- A disabled button is not an idempotency control.

## Quantitative Integrity

- Use decimal-safe database types for money, rates, and fractional manufacturing quantities.
- Define the authoritative unit for stored values.
- Convert units at explicit boundaries; do not scatter conversions through UI components.
- Centralize rounding rules for pricing, quantities, and totals.
- Recompute critical totals from authoritative detail when feasible rather than repeatedly accumulating floating-point deltas.

## State Transitions

- Treat important ERP statuses as a state machine, not a free-form dropdown.
- Define allowed transitions and the preconditions for each transition.
- Enforce critical transition rules server-side/database-side, not only in React.
- Do not allow a record to enter a state that implies downstream work succeeded when that work partially failed.

## Query Integrity and Performance

- Avoid N+1 queries. Collect identifiers and use set-based queries, joins, or appropriate views.
- Avoid fetching broad tables and filtering authorization/business scope only in the browser.
- Select only fields needed for high-frequency shop-floor screens when practical.

## Failure Behavior

- Fail clearly when a critical write cannot be completed.
- Do not swallow errors that could leave inventory, production, purchasing, sales, or document state ambiguous.
- Security/notification side effects may be best-effort only when the business transaction remains correct without them; document that decision.

## Review Checklist

- What is the complete business transaction?
- Can any step succeed while a later step fails?
- Could a retry duplicate the operation?
- Are money/quantity calculations decimal-safe and unit-explicit?
- Are status transitions valid and enforced outside the browser?
- Are parent/detail totals derived consistently?
- Are database constraints protecting invariants that should never be violated?
- Does the implementation avoid N+1 access patterns?
- Are tests focused on duplicate, partial-failure, rounding, and invalid-transition cases?

## ShopCore-Specific Constraint

Use Supabase/Postgres and ShopCore's existing TypeScript service/helper patterns. Do not add new external transaction libraries, job infrastructure, cache, or event systems.
