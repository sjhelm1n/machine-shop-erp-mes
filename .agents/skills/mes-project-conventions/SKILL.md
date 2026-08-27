---
name: mes-project-conventions
description: Apply this repository's engineering conventions for its TypeScript, React, Vite, Supabase, and Vercel application. Use whenever planning, implementing, reviewing, testing, or deploying application code, database changes, authentication, storage, or infrastructure in this MES project. Do not apply these repository-specific choices to unrelated projects.
---

# MES Project Conventions

Use these conventions for all work in this repository.

## Stack

- TypeScript
- React
- Vite
- Supabase
- Vercel

Do not introduce Next.js unless explicitly requested.

## TypeScript

- Use TypeScript for all application code.
- Avoid `any` unless there is no practical alternative.
- Prefer explicit domain types for Sales Orders, Work Orders, Routing Steps, Production Events, Customers, Messages, and Invoices.
- Keep domain logic separate from UI components where practical.

## React and Vite

- Use React with Vite.
- Keep components small and straightforward.
- Avoid unnecessary state-management libraries.
- Prefer local state, context, or simple reusable hooks unless complexity clearly requires more.
- Optimize mobile production screens for smartphone use.
- Avoid abstraction-heavy architecture.

## Supabase

Use Supabase for:

- PostgreSQL
- Authentication
- Row Level Security
- Storage
- Database migrations

Rules:

- RLS must enforce tenant and customer isolation.
- Never rely only on frontend authorization.
- Never expose the Supabase service-role key to client-side code.
- Use migrations for schema changes.
- Use foreign keys and indexes appropriately.
- Prefer database constraints for important integrity rules.
- Store immutable production events rather than overwriting production history.
- Invoice PDFs may use Supabase Storage.
- Customer users must only access records belonging to their customer account.

## Vercel

- Deploy the Vite application using Vercel.
- Keep environment variables out of source control.
- Separate public frontend environment variables from privileged server-side secrets.
- Keep deployment configuration minimal.

## General Engineering

- Prefer simple implementations.
- Avoid unnecessary dependencies.
- Avoid adding enterprise patterns without a clear requirement.
- Do not introduce microservices.
- Do not introduce queues, event buses, or distributed infrastructure unless explicitly required.
- Keep the codebase understandable by a small development team.
- Add tests for routing quantities, production-event calculations, percent complete, and authorization-sensitive behavior.
