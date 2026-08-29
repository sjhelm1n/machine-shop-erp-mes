---
name: erp-schema-evolution
description: Guide safe Supabase/Postgres schema changes for ShopCore ERP with RLS, generated TypeScript types, indexes, audit columns, secure views, and compatibility-aware migrations.
---

# ERP Schema Evolution

Use this skill for any ShopCore database migration, new table, changed relationship, view, RPC, or persistence-model change.

## Goal

Make the database the reliable system-of-record contract for ERP data while keeping TypeScript, authorization, and application behavior synchronized with schema changes.

## Contract Ownership

This skill defines **how database structures evolve and enforce requirements**. It does not define the ERP invariants themselves:

- Use `erp-domain-invariants` to determine the stable identities, exact revisions, posted-history rules, inventory relationships, units, and master-data retention the schema must preserve.
- Use `erp-tenant-boundaries` to determine when tenant-owned tables require direct `organization_id`, composite same-tenant foreign keys, organization-scoped uniqueness, and cross-tenant mismatch tests.
- Use `erp-data-integrity` to design atomic and idempotent business writes that use the schema.
- Use `erp-auditability` when the change must capture tamper-resistant evidence of permitted business actions.

A schema mechanism must not weaken a domain invariant merely for migration convenience. When requirements conflict, preserve the invariant and design an explicit compatible migration path.

## Required Workflow

1. **Inspect the current schema and the newest migration affecting the object.**
   - Do not copy an old migration pattern without checking the current implementation.

2. **Design the data model before writing UI code.**
   - Prefer normalized first-class columns for core business concepts.
   - Use JSONB only for flexible/custom attributes or structured configuration that does not need normal relational behavior.

3. **Create an explicit migration.**
   - Do not make production schema changes manually through an ad-hoc dashboard step that cannot be reproduced.

4. **Add authorization with the schema.**
   - Enable RLS for user-accessible business tables.
   - Scope organization/company data through the appropriate tenant/company key when the table is tenant-scoped.
   - Define `INSERT`/`UPDATE`/`DELETE` checks separately from read visibility where write permissions are more restrictive.

5. **Use secure views.**
   - PostgreSQL views exposed to application users must preserve underlying RLS behavior (`security_invoker` where supported/appropriate).
   - Never use a view as an accidental RLS bypass.

6. **Add indexes intentionally.**
   - Index foreign keys used in joins and tenant/company keys used in RLS/filtering.
   - Add additional indexes only for demonstrated query patterns.

7. **Keep provenance fields on important ERP records.**
   - Use created/updated timestamps and actor identifiers where the business record needs traceability.
   - Do not rely only on browser state for the identity of the writer.

8. **Regenerate Supabase TypeScript types after schema changes.**
   - Never hand-edit generated database types.
   - Use ShopCore's existing Supabase tooling/script; do not introduce a second type generator.

9. **Update validators and typed data-access code in the same change.**
   - A migration is incomplete if application validation and TypeScript contracts still represent the old schema.

10. **Verify compatibility.**
    - For released/stable surfaces, prefer additive changes and follow `erp-extension-contracts`.

## RLS Rules

- Authentication is not authorization.
- Protected React routes improve UX but do not protect database rows.
- RLS is the primary enforcement boundary for normal user access to Supabase data.
- Never depend on the client to supply a trustworthy tenant/company identifier without RLS validating access to it.
- Child tables without their own tenant/company key must still derive and enforce scope through a trusted parent relationship.
- Service-role access is not a substitute for well-designed RLS.

## Data-Type Rules

- Use PostgreSQL `numeric` for money, fractional quantities, rates, and values where binary floating-point drift would be unacceptable.
- Use integer types for whole counts.
- Use `timestamptz` for points in time and `date` for business calendar dates with no time meaning.
- Keep units explicit in names or the domain model when the same quantity could be interpreted in multiple units.

## Migration Review Checklist

- [ ] Migration is reproducible and source controlled.
- [ ] New/changed table has appropriate PK/FK constraints.
- [ ] RLS enabled and policies tested for allowed and denied users.
- [ ] Views preserve RLS.
- [ ] Tenant/company scope cannot be changed to escape authorization.
- [ ] Required foreign-key/filter indexes exist.
- [ ] Generated Supabase types refreshed.
- [ ] Runtime validators/types updated.
- [ ] Stable consumers reviewed for compatibility.
- [ ] Existing project typecheck/test/build verification completed.

## ShopCore-Specific Constraint

Use the Supabase/Postgres patterns already present in ShopCore. Do not introduce new external database packages, query libraries, monorepo tooling, or migration wrappers.
