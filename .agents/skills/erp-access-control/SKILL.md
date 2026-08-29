---
name: erp-access-control
description: Apply ERP-specific authorization boundaries in ShopCore using Supabase Auth, RLS, server-only privileged access, and fail-closed permission checks without introducing new authentication technology.
---

# ERP Access Control

Use this skill when changing authentication-adjacent code, permissions, roles, tenant/company scoping, protected data, privileged actions, storage access, or service-role operations.

## Goal

Make authorization a consistent data-boundary property rather than a collection of UI checks.

## Principles

1. **Separate authentication, navigation protection, and authorization.**
   - Supabase Auth proves who the user is.
   - Protected React routes prevent unauthenticated navigation and improve UX.
   - RLS and trusted server-side checks decide what that user may read or change.

2. **RLS is the normal-user data boundary.**
   - Business tables reachable from the client must have appropriate RLS.
   - Never rely on hiding a button or route as the only access control.
   - Test denied paths, not only successful paths.

3. **Scope every tenant/company-owned query and write.**
   - Where ShopCore supports organization/company ownership, rows must be bound to that scope through RLS or a trusted parent relationship.
   - A user-supplied company/tenant ID is an input, not proof of authorization.

4. **Keep service-role credentials server-only.**
   - Never expose Supabase service-role credentials through Vite client variables, browser bundles, local storage, or generated HTML.
   - Use privileged access only for operations that actually require bypassing RLS.
   - Prefer user-scoped/RLS-enforced operations whenever possible.

5. **Privileged checks fail closed.**
   - If a permission, role, or scope check cannot be evaluated reliably, deny the privileged action rather than granting it by default.
   - Error handling must not convert an authorization-service failure into permission.

6. **Centralize permission vocabulary.**
   - Persisted permission identifiers are stable contracts once deployed.
   - Avoid one-off strings and subtly different permission names across modules.
   - Follow `erp-extension-contracts` before renaming persisted permission identifiers.

7. **Protect files as data.**
   - Use private Supabase Storage for non-public ERP documents and generated files.
   - Storage policy must enforce the same user/company access expectations as the database record that references the file.

8. **Centralize runtime configuration boundaries.**
   - Only variables intentionally safe for the browser may use Vite's public client exposure.
   - Keep server secrets in Vercel/server runtime configuration.
   - Maintain an `.env.example` with names and purpose, never real secret values.
   - Required server configuration should fail clearly when missing rather than silently weakening security.

## Change Checklist

- [ ] Does the database enforce this rule even if the UI is bypassed?
- [ ] Are `SELECT` and mutation permissions appropriately different?
- [ ] Can a user change a tenant/company identifier to access another scope?
- [ ] Is any service-role use necessary and narrowly contained?
- [ ] Do privileged errors deny rather than allow?
- [ ] Are storage policies aligned with record access?
- [ ] Are permission identifiers centralized/stable?
- [ ] Were both allowed and denied cases verified?
- [ ] Are all secrets server-only?

## Explicit Non-Goals

This skill does **not** introduce MFA, passkeys, OAuth providers, Redis/session caches, bot-protection products, or a cookie-session architecture. Those are separate product decisions and are not part of ShopCore's current stack requirements.
