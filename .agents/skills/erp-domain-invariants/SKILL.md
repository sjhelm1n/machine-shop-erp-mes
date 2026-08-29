---
name: erp-domain-invariants
description: Preserve ShopCore's stable identities, exact manufacturing revisions, posted history, inventory reconciliation, explicit units of measure, controlled-item identity, and referenced master data. Use when work touches ERP master data or inventory-affecting transactions; pair it with workflow, security, date/time, performance, and traceability guidance as applicable.
---

# ERP Domain Invariants

Keep ShopCore data internally consistent and historically trustworthy as modules and workflows expand.

Use this skill when work touches:

- items, BOMs, routings, or revisions;
- jobs or work orders;
- purchasing, receiving, inventory, production, or shipping;
- units of measure and quantity conversion;
- corrections, reversals, or adjustments;
- master-data lifecycle.

## Contract Ownership

This skill defines **what must remain true** across ShopCore's ERP domain. It does not replace the skills that define how those guarantees are implemented:

- Use `erp-data-integrity` for atomic write boundaries, idempotency, rounding, state transitions, and failure behavior.
- Use `erp-schema-evolution` when a migration, relationship, constraint, view, RPC, or persistence model must enforce an invariant.
- Use `erp-auditability` to record evidence of permitted changes; an audit row never makes a forbidden rewrite or deletion acceptable.
- Load the applicable workflow, access-control, date/time, data-scale, extension-contract, or traceability guidance when those concerns are also present.

## Stable Identity

- Use immutable internal IDs for relationships.
- Do not use names, descriptions, or editable display numbers as relational keys.
- Human-readable identifiers may change without breaking historical relationships.

## Exact Revisions and Versions

When a transaction depends on a manufacturing definition, retain the exact revision or version used, including the applicable:

- item revision;
- BOM revision;
- routing or manufacturing-method version.

Changing the current revision must not silently change historical jobs, receipts, production records, or other posted transactions.

## Posted Transactions Are Facts

Once a business event is posted, preserve it. This includes receipts, inventory issues, production completions, scrap, transfers, and shipments.

Correct errors with an explicit reversal, return, adjustment, or correction transaction. Do not silently rewrite or delete posted history to make the current state appear correct.

## Inventory Reconciliation

Inventory changes must be explainable by the transactions that caused them. Every inventory-affecting operation should identify, where applicable:

- item;
- quantity;
- location or bin;
- source or destination;
- originating business document or event.

Transfers, splits, merges, issues, receipts, and reversals must conserve quantity according to the business operation.

Do not directly overwrite inventory balances without recording the responsible event. If ShopCore already uses a database-maintained summary or other derived on-hand balance for performance, keep it reconcilable to the authoritative transaction history. This does not authorize adding new cache infrastructure.

## Explicit Units of Measure

Do not assume that purchase, inventory, and production units of measure are equal.

- Define conversions explicitly and centrally, such as `1 BOX = 24 EA` or `1 FT = 12 IN`.
- Use a defined base or inventory unit where appropriate.
- Store conversion factors explicitly and make their direction unambiguous.
- Do not scatter hard-coded conversion factors throughout application code.
- Use decimal-safe numeric handling when quantity precision matters.
- Reject transactions that require an undefined or ambiguous conversion.

## Controlled-Item Identity

If an item is lot- or serial-controlled, preserve that tracked identity in every applicable inventory, production, receipt, shipment, correction, or transfer transaction.

Do not allow an operation to break the relationship to the controlled lot or serial. Detailed genealogy rules belong in dedicated traceability guidance when that subsystem is implemented.

## Referenced Master Data

Once master data has business history, prefer `inactive`, `archived`, or `superseded` over hard deletion.

Historical records must retain their original relationships even when items are replaced, suppliers become inactive, work centers are retired, or revisions are superseded.

## Database Enforcement

Do not rely only on UI behavior. Enforce critical invariants in the database where practical with:

- foreign keys;
- unique constraints;
- check constraints;
- restrictive delete rules;
- appropriate numeric types;
- atomic Postgres transactions or RPCs.

A multi-record business operation must complete entirely or not complete.

This section defines the required domain outcome. Follow `erp-schema-evolution` for structural database changes and `erp-data-integrity` for the transactional write design.

## Review Checklist

- Relationships use stable internal IDs.
- Exact revision or version is preserved where required.
- Posted history is corrected rather than rewritten.
- Inventory changes are explainable and reconcile.
- UOM conversions are explicit and decimal-safe.
- Lot or serial identity is preserved for controlled items.
- Historical master-data references cannot disappear.
- Critical invariants are enforced in the database where practical.
- Multi-record posting operations are atomic.

## Core Principle

ShopCore should always be able to explain what happened, to which exact business entity or revision, in what quantity, and why.
