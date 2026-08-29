---
name: erp-tenant-boundaries
description: Enforce ShopCore organization isolation structurally across tenant-owned tables, relationships, scoped uniqueness, RLS, RPCs, imports, APIs, and privileged paths. Use when adding or reviewing tenant-owned schema or operations that connect multiple company-owned records.
---

# ERP Tenant Boundaries

Prevent every ShopCore organization from reading, referencing, mutating, or deriving authority from another organization's tenant-owned records.

Enforce the boundary through both authorization and relational structure. Passing RLS alone is insufficient when the database can still persist a cross-tenant relationship.

## Project Vocabulary

`organization_id` is ShopCore's canonical persisted tenant key. “Company” is the business concept; do not introduce a parallel `company_id` column or rename the existing key without an explicit compatibility-aware migration.

## Contract Ownership

This skill owns the **same-tenant invariant** across records and execution paths:

- Use `erp-access-control` for membership, roles, permissions, RLS policy design, and server-only credentials.
- Use `erp-schema-evolution` for migration mechanics, indexes, generated types, and secure-view implementation.
- Use `erp-data-integrity` for atomic multi-record writes and retry behavior.
- Use `erp-data-scale` for import, export, and synchronization workflow design.

Those skills remain authoritative for their concerns; this skill requires them to preserve one organization boundary end to end.

## Tenant-Owned Records

- Every independently tenant-owned business record must carry `organization_id not null`.
- Do not infer ownership only through another record when the row is itself a company-owned business entity.
- Examples include customers, suppliers, items, jobs, routings, inventory, purchase orders, sales orders, work orders, and production records.
- Treat a child as parent-owned rather than independently tenant-owned only when that dependency is intentional, immutable, and enforced by its foreign key and access path.

## RLS Boundary

- Enable RLS on tenant-owned tables exposed through Supabase.
- Policies must deny cross-organization reads, inserts, updates, and deletes.
- Validate membership and the required permission from trusted authenticated context.
- Prevent an update from moving a row to another organization.
- Test denied paths as well as successful ones.

RLS is the normal-user authorization boundary. It does not replace relational enforcement.

## Tenant-Safe Relationships

When both sides of a relationship are tenant-owned, preserve `organization_id` in the foreign key:

```sql
foreign key (organization_id, customer_id)
  references public.customers (organization_id, id)
```

Do not rely only on `foreign key (customer_id) references customers(id)`, because it does not prove same-organization ownership.

- Add the required composite unique or primary-key constraint on the referenced columns.
- Index tenant-scoped foreign keys according to actual join and filtering patterns.
- Apply the same rule to junction tables and polymorphic references where practical; otherwise enforce equivalent validation inside the trusted write boundary.

## Tenant-Scoped Uniqueness

Include `organization_id` in identifiers that are unique only within one company:

```sql
unique (organization_id, part_number)
```

Use global uniqueness only when the business rule genuinely spans every ShopCore organization. Matching logic in imports, APIs, and application services must mirror the database's tenant-scoped uniqueness and normalization rules.

## Trusted Organization Context

- Never treat a browser-supplied `organization_id` as authority.
- Establish the active organization from the authenticated profile, a trusted parent record, or another server-validated membership context.
- A client identifier used for routing or selection must be checked against that trusted context before use.
- Application queries should include the active `organization_id` where practical even when RLS also enforces it. This keeps query intent explicit and protects future privileged execution paths.

## Privileged Paths and RPCs

Service-role and other privileged operations may bypass RLS. Every such path must:

1. establish the authorized organization;
2. filter tenant-owned reads and writes explicitly by `organization_id`;
3. validate that every referenced record belongs to that organization; and
4. fail closed when scope cannot be established.

RPCs and database functions that accept record IDs must repeat these checks inside the transaction. Matching IDs supplied by a caller are inputs, not proof of ownership.

## Imports, APIs, and Views

- Resolve external identifiers inside the authorized organization.
- Reject an otherwise valid identifier from another organization as unavailable.
- Never allow an import, API, integration, or synchronization job to establish a cross-organization relationship.
- Exposed views must preserve underlying RLS using the project's approved secure-view pattern.
- Privileged reports and exports must scope every source explicitly.

## Boundary Tests

For critical tenant-owned tables and workflows, test attempts to:

- read, update, and delete another organization's row;
- insert using another `organization_id`;
- reference a parent from another organization;
- change an existing row's organization;
- call an RPC with another organization's record ID;
- import or match against another organization's identifier; and
- execute a privileged path with mismatched organization and entity IDs.

Every attempt must fail without leaking the existence or contents of the other organization's record.

## Definition of Done

A tenant boundary is complete only when:

1. RLS denies unauthorized row access and mutation;
2. cross-organization relationships are structurally impossible where practical;
3. tenant-scoped uniqueness matches the business rule;
4. RPCs, imports, APIs, reports, and privileged paths preserve scope explicitly; and
5. automated mismatch tests prove the boundary fails closed.
