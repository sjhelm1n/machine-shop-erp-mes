# ShopCore Extension Contracts

This register distinguishes intentional ShopCore integration surfaces from implementation details. Compatibility cost applies only after a surface is released, persisted, or externally consumed.

## Frozen identifiers

- React paths used by bookmarks, travelers, QR codes, email, or portal links, including `/produce/:workOrderId/:stepId`, `/app/...`, `/portal/...`, and the current auth callback paths.
- Persisted role values `manufacturer` and `customer`.
- Private Storage bucket `invoices` and object path convention `organization_id/customer_id/random-document.pdf`.
- Existing public RPC names and argument names: `create_sales_order`, `create_work_order`, `add_sales_order_line`, `record_production_event`, `reverse_production_event`, customer portal RPCs, and archive/edit RPCs.
- New released public RPCs `record_production_event_v2`, `production_step_snapshot`, and `mark_sales_order_milestone`.

Renames require a compatibility bridge, consumer migration, and an explicit removal decision. The original `record_production_event` remains a compatibility wrapper; new production callers use `record_production_event_v2` for durable retry protection.

## Stable contracts

- Public-table identifiers used by the application, reports, RLS, or persisted foreign keys.
- Generated Supabase database types in `src/types/database.generated.ts`; regenerate them from the connected project after each migration.
- Runtime service/domain mappings for production events and the production-step snapshot.
- Customer portal RPC return shapes and document metadata/path conventions.
- Audit-log record shape and append-only, organization-scoped access behavior.

Prefer additive columns and optional request fields. Update migration, generated database types, runtime validators/services, and UI in one change.

## Internal surfaces

- React component state, CSS selectors, page layout, demo-data helpers, and private TypeScript helpers.
- Functions in the Postgres `private` schema. Public wrappers are the extension surface; private implementations may change with their callers.
- Audit capture implementation and internal production calculations, provided their public results and persisted invariants remain compatible.

Do not integrate through UI internals or private helpers. Add a typed service and an intentional public RPC/table/view contract when a real cross-module or external consumer appears.
