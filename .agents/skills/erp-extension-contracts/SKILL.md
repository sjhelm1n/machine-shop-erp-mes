---
name: erp-extension-contracts
description: Protect ShopCore ERP extension points and public contracts so the platform can evolve without breaking integrations, reports, routes, templates, or downstream applications. Use when adding or changing a capability that may become a dependency outside its implementation module.
---

# ERP Extension Contracts

Use this skill when adding or changing a ShopCore capability that may become a dependency for another module, customer-specific extension, report, integration, document template, or external application.

## Goal

Keep ShopCore open to extension without turning every internal implementation detail into a permanent public contract.

## Core Rules

1. **Separate internal implementation from stable extension surfaces.**
   - UI component internals are not an integration API.
   - Prefer typed service/data-access helpers and intentional Supabase RPCs or documented table/view contracts for reusable operations.
   - Do not make external consumers depend on incidental component state, CSS selectors, or private helper functions.

2. **Classify a surface before treating it as stable.**
   - `INTERNAL`: free to change with its callers.
   - `STABLE`: additive changes preferred; breaking changes require migration/deprecation handling.
   - `FROZEN IDENTIFIER`: persisted or externally referenced names that should not be silently renamed.

3. **Treat these as stable once released or externally consumed.**
   - Persisted database identifiers used by integrations or reports.
   - Supabase RPC/function names and documented argument/return contracts.
   - Permission/role identifiers stored in data.
   - React route paths used in bookmarks, QR codes, emails, or external links.
   - Storage bucket/path conventions used by application logic.
   - `.docx` template placeholder names already used in deployed templates.

4. **Prefer additive evolution.**
   - Add fields before removing or renaming old fields.
   - Add optional parameters instead of changing required signatures.
   - Keep old route paths working with redirects when practical.
   - For renamed identifiers, provide a compatibility bridge and migrate consumers before removal.

5. **Do not freeze the whole product too early.**
   - ShopCore is still evolving. Internal-only tables, helpers, and components may be refactored when there is no external or persisted dependency.
   - The cost of compatibility should be proportional to the number and importance of consumers.

6. **Keep extensions domain-oriented.**
   - Expose business concepts such as customers, parts, jobs, work orders, operations, inventory, and documents.
   - Do not expose implementation-specific state when a stable business concept exists.

7. **Use custom data deliberately.**
   - JSON/JSONB custom fields may support truly customer-specific attributes.
   - Core ERP fields that must be validated, joined, filtered, secured, indexed, or reported consistently should remain first-class relational columns.
   - Never move required core business data into generic JSON solely to avoid a migration.

## Change Workflow

Before changing a potentially stable surface:

1. Identify known consumers in ShopCore.
2. Determine whether the surface is `INTERNAL`, `STABLE`, or a `FROZEN IDENTIFIER`.
3. If `STABLE` or `FROZEN IDENTIFIER`, design an additive or bridged change.
4. Update types and validators with the same change.
5. Update affected integrations, routes, reports, QR links, or document templates.
6. Run the existing ShopCore verification workflow before calling the work complete.

## Review Checklist

- Does this create an intentional extension point or an accidental dependency?
- Could another application use this without importing UI internals?
- Are identifiers stable where they are persisted or externally referenced?
- Is the change additive where compatibility matters?
- Are database, TypeScript, validation, and document/template contracts still aligned?
- Did we avoid adding infrastructure or dependencies just to make the design look more "platform-like"?

## ShopCore-Specific Constraint

Do not introduce new infrastructure or frameworks under this skill. Use ShopCore's existing React, TypeScript, Vite, Supabase, Vercel, routing, storage, and document-template patterns.
