---
name: erp-auditability
description: Add tamper-resistant, tenant-scoped auditability to critical ShopCore ERP changes using existing Supabase/Postgres and private storage capabilities.
---

# ERP Auditability

Use this skill when implementing or changing business actions where the organization may need to answer: who changed it, what changed, when, from what context, and what the prior value was.

## Goal

Provide useful ERP traceability without copying Carbon's dynamic per-company audit-table architecture or relying on permissive RLS.

## Contract Boundary

This skill defines **how to preserve evidence of permitted changes**. It does not grant permission to change or delete a business record.

- Follow `erp-domain-invariants` for immutable posted facts, correction transactions, stable identities, exact revisions, and retained historical relationships.
- An audit `UPDATE` or `DELETE` operation describes an action that was already allowed by the applicable domain and lifecycle rules; recording it does not make an otherwise forbidden mutation acceptable.
- Use `erp-data-integrity` for the atomic write boundary and `erp-schema-evolution` for the audit schema, constraints, and policies.

## What Should Be Auditable

Prioritize high-consequence entities and transitions, such as:

- User/permission administration.
- Customer/supplier master data where changes affect transactions.
- Parts/items and revisions when they affect planning or production.
- Work orders, routing/operation status, and material transactions.
- Inventory adjustments, receipts, shipments, and transfers.
- Quote/order status or price changes that materially change commitments.
- Controlled document/template changes when ShopCore owns the document state.

Do not log every UI interaction or noisy derived field by default.

## Recommended Record Shape

Use a shared, tenant/company-scoped audit structure unless a stronger requirement justifies something else:

- `id`
- `company_id` / organization scope when applicable
- `entity_type`
- `entity_id`
- `record_id` when a child record changed
- `operation` (`INSERT`, `UPDATE`, `DELETE`, or a meaningful business event)
- `actor_id` (nullable only for legitimate system actions)
- `diff` or before/after snapshot containing meaningful changed fields
- `source` / `origin` when useful
- `request_id` or correlation identifier when available
- `created_at`

Avoid storing secrets or unnecessary sensitive content in audit diffs.

## Security Requirements

1. **Audit rows are append-only.**
   - Normal application users cannot update or delete historical audit entries.
   - If retention requires deletion, use a narrow controlled archival/purge path.

2. **Audit data uses RLS.**
   - Keep company/tenant isolation in database policy.
   - Do not copy Carbon's permissive audit-log RLS plus dynamic-table isolation approach into ShopCore.

3. **Privileged/system writes remain attributable.**
   - If `actor_id` is null for service/system work, capture enough source/context to explain why.

4. **Archive privately.**
   - If audit history is archived, use ShopCore's existing private Supabase Storage capability and enforce access controls.

5. **Auditability is not compliance by itself.**
   - This skill improves evidence and integrity but does not claim NIST 800-171, CMMC, ISO, or other certification/compliance.

## Diff Rules

- Record business-meaningful old/new values.
- Ignore routine fields such as `updated_at` when they add noise but no evidence value.
- Preserve human-readable references when practical, but retain immutable IDs as the authoritative link.
- Avoid huge document blobs in row diffs; log metadata/version/hash/reference instead.

## Implementation Sequence

1. Define which entities/actions require audit.
2. Create/extend the audit schema with RLS and append-only behavior.
3. Capture audit entries at a trusted write boundary.
4. Verify normal users cannot mutate history.
5. Verify cross-company access is denied.
6. Add a simple read surface only when there is a real operational/admin need.
7. Establish retention only after business/security requirements are known.

## Review Checklist

- Can we reconstruct who changed a critical record and what changed?
- Can the actor alter or erase the evidence through normal application access?
- Does RLS isolate audit records by company/tenant?
- Are service/system changes identifiable?
- Are noisy fields excluded?
- Are secrets and unnecessary sensitive data excluded from diffs?
- If archived, is the archive private and access-controlled?

## ShopCore-Specific Constraint

Use existing Supabase/Postgres and Supabase Storage capabilities. Do not add an external Inngest pipeline, dynamic audit tables, Redis, or other infrastructure to implement this skill.
