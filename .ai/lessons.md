# Development Lessons

Record only durable, project-specific lessons that should change future implementation or review decisions.

Use one concise entry per lesson:

`Context -> Problem -> Rule -> Applies to`

## Lessons

Supabase project changes -> CLI use was explicitly rejected for connected work -> Use the Supabase MCP for inspection, migrations, generated types, advisors, and database verification; keep exact migrations source controlled -> All agent-driven Supabase work
Overlapping ERP skills -> Repeated rules can create ambiguous ownership even when they agree -> Declare what each skill owns and cross-link complementary implementation guidance -> Local ERP platform skills
Scoped server-confirmed mutations -> A full shop-data refresh made simple status buttons wait on unrelated slow queries -> Return the authoritative changed value and patch only the affected entity in context -> Single-record CRUD and milestone actions
Timezone correction migrations -> Future trigger logic was fixed while legacy UTC-derived completion dates remained wrong -> Include a narrowly scoped, audited backfill and verify boundary records whenever persisted business-date semantics change -> ERP dates derived from timestamps
Production-route data isolation -> Clearing the shared shop cache on entry left every app view empty when returning from a station -> Preserve same-user, same-tenant data across route changes and revalidate it on exit; clear only when the authenticated data scope changes -> Full-screen production routes backed by narrow snapshots
Production-event time series -> Automatic week/month bucketing relabeled scrap events onto a shared period-start date -> When a report promises the recorded date, filter by the selected period but aggregate on each event's plant-local `created_at` calendar day -> Scrap and other immutable production-event charts
Order Q&A content -> UI-only sanitization can be bypassed and silent URL removal obscures why a message changed -> Normalize markup/control characters to plain text, reject links and executable URI schemes explicitly, render only text nodes, and mirror the restriction with a database check -> Manufacturer and customer chat messages
Conversation retention lifecycle -> A scheduled archive flag would duplicate sales-order completion state and require background infrastructure -> Derive active/archived status from authoritative completion facts and the plant-local closing date, preserve archived history, and block replies through the shared mutation boundary -> Sales-order-linked Q&A
Additive columns on restricted tables -> A new customer field was omitted from explicit column-level grants and returned 403 despite correct RLS -> Every client-writable column migration must extend and test the applicable column grants -> Supabase tables with narrowed INSERT or UPDATE privileges
Browser-based shop-floor device enrollment -> Web apps cannot read hardware MAC addresses and phones randomize them -> Use a server-issued ShopCore Device ID plus a hashed credential and observed-network approval -> QR production access on phones and tablets
