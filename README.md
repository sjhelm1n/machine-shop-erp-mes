# ShopCore ERP

ShopCore ERP is a lightweight ERP/MES MVP for a machine shop with fewer than ten employees. It begins with an accepted customer purchase order and records sales orders, work orders, routing, production movement, scrap, customer questions, and archived invoice PDFs.

Its operating principle is simple: **paper communicates the work; digital captures the flow.** A generated traveler is the primary floor document. Each routing step has a QR code that opens a one-handed production screen where the normal transaction is scan → tap `+1` → done.

## What is included

- Manufacturer dashboard focused on visibility, not scheduling
- Customer master and multi-user customer-account model
- Accepted sales orders with manufactured and non-manufactured lines
- Per-piece and flat-rate pricing
- Multiple work orders per manufactured sales-order line
- Ordered routing without a separate work-center master
- Immutable release, adjustment, transfer, scrap, and reversal events
- Partial transfer, one-piece flow, scrap, and overproduction support
- Event-derived quantities, timestamps, status, and completion percentage
- QR traveler PDF generation
- Mobile-first production transactions with an optional short undo
- Customer portal with safe stage names instead of internal operation details
- Order-linked plain-text Q&A
- Private PDF invoice archive backed by Supabase Storage
- Email/password auth, password recovery routes, RLS, explicit grants, and storage policies
- Demo data and a no-backend demo mode

CPQ, estimating, purchasing, inventory, accounting, shipping, scheduling, labor tracking, and the other enterprise modules named in the product brief are intentionally absent.

## Architecture

The application is a single Vite SPA deployed as static assets on Vercel. React Router mounts manufacturer, customer, auth, and direct production routes. One shared Supabase browser client uses only the project URL and browser-safe publishable key. Data access lives in `src/services`; production calculations remain pure TypeScript in `src/domain/routing.ts` and are independently unit tested.

Supabase is the trusted boundary:

- Postgres owns operational data and constraints.
- Auth owns sessions; `public.profiles` binds each user to an organization and role.
- RLS and explicit grants isolate organizations and customer accounts.
- A private schema contains authorization and trigger helpers.
- Customer portal RPCs return a narrow, pre-aggregated contract; customer sessions cannot select raw sales orders, work orders, routing mappings, prices, notes, or production events.
- Security-invoker RPCs make multi-row order/work-order creation atomic while retaining RLS.
- A validation trigger serializes each work order’s production writes and rejects transfers greater than current availability.
- Storage keeps invoices in a private bucket. Object paths are `organization/customer/random-invoice.pdf` and downloads use 60-second signed URLs.

There is no custom API server or service-role key in the browser.

## Data-model resolutions

The initial brief left four small production questions open. This implementation resolves them as follows:

1. **First-step quantity:** creating a work order inserts a `release` event equal to ordered quantity. An `adjustment` event can add a documented overrun without changing the accepted order quantity. Seed data demonstrates a release of 102 against an order for 100.
2. **Step completion:** a step is complete when it has entered quantity, has activity, has zero remaining quantity, and every upstream step also has zero remaining quantity. This provides the brief’s “no additional upstream quantity expected” rule without a manual status.
3. **Undo:** events are never updated or deleted. For five minutes, undo can add a `reversal` event referencing the original transfer or scrap; the database rejects late or duplicate reversals.
4. **Portal stages:** internal routing and customer-visible stages are stored separately. Private database functions aggregate the synchronized stage mappings and immutable events, then public security-invoker wrappers return only safe percentages and stage names. Customer users cannot query the underlying mappings or events.

## Routing calculations

For each routing step, ignoring events that have a later reversal:

```text
entered = release/adjustment at this step + transfers into this step
transferred = transfers out of this step (a null destination means final completion)
scrapped = scrap events at this step
available = entered - transferred - scrapped
processed = transferred + scrapped
```

The database rejects a transfer or scrap when `quantity > available`. It does not compare the event quantity with `quantity_ordered`, so overproduction is allowed.

Work-order customer progress is quantity-aware across every routing step:

```text
sum(min(step processed, quantity ordered))
------------------------------------------------ × 100
quantity ordered × number of routing steps
```

The result is capped at 100%. Sales-order progress is the quantity-weighted average of its work-order percentages, using each work order’s ordered quantity as the weight. Scrap counts as processing at the step where the work occurred but reduces the good quantity available downstream.

Timestamps are derived from active events:

- **Entered at:** first release/adjustment or inbound transfer (the first step falls back to `released_at`).
- **Started at:** first transfer or scrap associated with the step.
- **Completed at:** latest relevant event when the completion rule above becomes true.

## Local setup

Requirements: Node.js 20+ and npm. Supabase CLI plus Docker are needed only for a local Supabase stack.

```bash
npm install
cp .env.example .env.local
npm run dev
```

The example enables `VITE_DEMO_MODE=true`. Demo mode is a fully interactive local tour with manufacturer/customer switching and in-memory mutations; it never represents a security boundary.

Run quality checks with:

```bash
npm test
npm run lint
VITE_DEMO_MODE=true npm run build
```

## Supabase setup

1. Install the current [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and authenticate it.
2. Link a project or start the local stack.
3. Apply the migration and optional seed.

```bash
supabase start
supabase db reset
supabase test db
```

For a hosted project, link it and use the normal migration workflow:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The schema is in `supabase/migrations/20260825210000_initial_erp_mes_schema.sql`; demo data is in `supabase/seed.sql`. The seed creates operational records but deliberately does not write directly to Supabase-managed `auth.users`, whose internal schema may change. Create users through Auth, then associate their IDs:

```sql
insert into public.profiles(id, organization_id, customer_id, display_name, role)
values
  ('MANUFACTURER_AUTH_USER_UUID', '10000000-0000-0000-0000-000000000001', null, 'Shop Admin', 'manufacturer'),
  ('ACME_AUTH_USER_UUID', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Acme Portal User', 'customer');
```

Multiple profile rows can reference the same `customer_id`, which supports multiple portal users for one customer.

### Environment variables

For a connected Supabase project, set:

```dotenv
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

The app fails immediately when demo mode is off and either required value is missing. Never place a service-role key, secret key, database password, or server-only token in a `VITE_` variable.

In Supabase Auth URL configuration, add local and production redirect URLs for:

- `/auth/confirm`
- `/update-password`
- `/app`
- `/portal`

## Security notes

- Every public table has RLS enabled and an explicit operation policy.
- `anon` has no public-table grants.
- Manufacturer writes are constrained to the profile’s organization.
- Customer messages, invoices, and customer-account rows are constrained to the profile’s organization and `customer_id`; order and production summaries come only from customer-safe RPCs.
- Raw sales orders, line-item prices, work orders, internal routing, portal mappings, and production events have manufacturer-only select policies.
- Production events have no operator-identity column or update/delete grant and are validated under a per-work-order advisory transaction lock.
- Customer messages have plain-text database checks, a 2,000-character limit, and only `read_at` is updatable.
- Invoice uploads require a `.pdf` extension and `application/pdf` MIME type in both browser code and Storage policy. The private bucket has a 10 MB limit.
- Frontend route guards improve UX; RLS and Storage policies provide the real authorization.

The pgTAP file in `supabase/tests/database` checks RLS presence, anonymous grants, customer-vs-manufacturer behavior, safe portal RPC isolation, completion-date privileges, operator-neutral events, and bucket privacy. Pure TypeScript tests cover partial transfers, scrap, one-piece flow, overproduction, reversals, transfer limits, quantity-weighted aggregate progress, customer-safe aggregate overrides, and link-free message sanitization.

## Vercel deployment

1. Import the repository into Vercel.
2. Use framework preset **Vite**, build command `npm run build`, and output directory `dist`.
3. Add the three environment variables above for Preview and Production.
4. Add the deployed origin and auth callback paths to Supabase Auth’s allowed redirect URLs.
5. Deploy.

`vercel.json` rewrites every application path to `index.html`, so QR links, portal order URLs, and password-recovery deep links work when opened directly. It also sets CSP, clickjacking, MIME-sniffing, referrer, permissions, and transport-security headers.

## Main routes

| Audience | Route | Purpose |
| --- | --- | --- |
| Public auth | `/login`, `/forgot-password`, `/auth/confirm`, `/update-password` | Session and recovery |
| Manufacturer | `/app` | Visibility dashboard |
| Manufacturer | `/app/customers` | Customer master |
| Manufacturer | `/app/sales-orders` | Accepted orders and pricing lines |
| Manufacturer | `/app/work-orders/:id` | Routing, quantities, timestamps, traveler |
| Shop floor | `/produce/:workOrderId/:stepId` | QR-driven mobile transaction without operator tracking |
| Manufacturer/customer | questions and invoice routes under `/app` or `/portal` | Scoped Q&A and documents |
| Customer | `/portal`, `/portal/orders/:id` | Safe progress and order history |

## Production handoff checklist

- Apply migrations to a staging Supabase project and run `supabase test db`.
- Create Auth users and profile associations; test one manufacturer and both customers.
- Upload a real PDF and verify each customer can download only its own invoice.
- Print a traveler and scan every QR code using the phones used on the shop floor.
- Verify Auth redirect URLs in both Vercel Preview and Production.
- Confirm the shop’s procedure for the manufacturer-only **Record overrun** action; every adjustment remains an immutable production event.
