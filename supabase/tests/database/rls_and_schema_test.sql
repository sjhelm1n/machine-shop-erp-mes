begin;
create extension if not exists pgtap with schema extensions;
select plan(95);

select has_table('public', 'organizations', 'organizations exists');
select has_table('public', 'customers', 'customers exists');
select has_table('public', 'sales_orders', 'sales_orders exists');
select has_table('public', 'work_orders', 'work_orders exists');
select has_table('public', 'production_events', 'production_events exists');
select has_table('public', 'customer_messages', 'customer_messages exists');
select has_table('public', 'customer_documents', 'customer documents exist');
select hasnt_table('public', 'invoices', 'legacy invoices table was generalized');
select has_column('public', 'customer_documents', 'document_type', 'customer documents have a type');
select has_column('public', 'customer_documents', 'document_name', 'customer documents have a name or number');
select is(
  (
    select string_agg(enum_value.enumlabel, ',' order by enum_value.enumsortorder)
    from pg_type enum_type
    join pg_enum enum_value on enum_value.enumtypid = enum_type.oid
    join pg_namespace enum_namespace on enum_namespace.oid = enum_type.typnamespace
    where enum_namespace.nspname = 'public' and enum_type.typname = 'customer_document_type'
  ),
  'customer_po,invoice,drawing,other',
  'customer document types are constrained'
);
select has_column('public', 'customers', 'logo_url', 'customers have an optional logo URL');
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.customers'::regclass and conname = 'customers_logo_url_https_check'),
  'customer logo URLs are constrained to safe HTTPS values'
);
select hasnt_column('public', 'routing_steps', 'work_instructions_revision', 'routing steps omit work-instruction revisions');
select has_column('public', 'sales_orders', 'sales_order_name', 'sales orders have a distinct name');
select has_column('public', 'work_orders', 'work_order_name', 'work orders have a distinct name');
select has_column('public', 'sales_orders', 'shipped_at', 'sales orders record shipment confirmation');
select has_column('public', 'sales_orders', 'invoiced_at', 'sales orders record invoice confirmation');
select has_column('public', 'sales_orders', 'archived_at', 'sales orders can be archived');
select has_column('public', 'work_orders', 'archived_at', 'work orders can be archived');
select has_column('public', 'sales_order_line_items', 'archived_at', 'sales-order lines can be archived without deletion');
select is((select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'sales_orders' and column_name = 'sales_order_name'), 'NO', 'sales order names are required after defaulting');
select is((select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'work_orders' and column_name = 'work_order_name'), 'NO', 'work order names are required after defaulting');

select is(
  (
    select udt_schema || '.' || udt_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
  ),
  'public.profile_role',
  'profiles.role uses the profile_role enum'
);
select is(
  (
    select string_agg(enum_value.enumlabel, ',' order by enum_value.enumsortorder)
    from pg_type enum_type
    join pg_enum enum_value on enum_value.enumtypid = enum_type.oid
    join pg_namespace enum_namespace on enum_namespace.oid = enum_type.typnamespace
    where enum_namespace.nspname = 'public' and enum_type.typname = 'profile_role'
  ),
  'manufacturer,customer',
  'profile_role contains only the supported application roles'
);

select ok((select relrowsecurity from pg_class where oid = 'public.sales_orders'::regclass), 'sales_orders has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.work_orders'::regclass), 'work_orders has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.production_events'::regclass), 'production_events has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.customer_messages'::regclass), 'customer_messages has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.customer_documents'::regclass), 'customer documents have RLS enabled');
select matches((select with_check::text from pg_policies where schemaname = 'public' and tablename = 'customer_documents' and policyname = 'customer_documents_insert'), 'manufacturer-document-upload-v1', 'document inserts require the current manufacturer attestation');
select matches((select qual::text from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'invoice_objects_select'), 'customer_documents', 'private object access resolves through customer document metadata');

select is(
  (select count(*)::integer from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'),
  0,
  'anon has no public table grants'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'routing_steps' and policyname = 'routing_steps_select'),
  'internal routing is protected by a manufacturer-only policy'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_stage_mappings' and policyname = 'customer_stage_mappings_select'),
  'portal-safe stage mappings have an access policy'
);
select ok(
  (select not public from storage.buckets where id = 'invoices'),
  'customer document PDF bucket is private'
);

select hasnt_column('public', 'production_events', 'created_by', 'production events do not track operators');
select has_function('public', 'customer_portal_sales_orders', array[]::text[], 'customer sales-order portal RPC exists');
select has_function('public', 'customer_portal_sales_order_lines', array[]::text[], 'customer line-item portal RPC exists');
select has_function('public', 'customer_portal_work_orders', array[]::text[], 'customer work-order portal RPC exists');
select has_function('public', 'add_sales_order_line', array['uuid', 'jsonb'], 'sales-order line append RPC exists');
select has_function('public', 'set_sales_order_archived', array['uuid', 'boolean'], 'sales-order archive RPC exists');
select has_function('public', 'set_work_order_archived', array['uuid', 'boolean'], 'work-order archive RPC exists');
select has_function('public', 'update_sales_order_line', array['uuid', 'jsonb'], 'sales-order line edit RPC exists');
select has_function('public', 'set_sales_order_line_archived', array['uuid', 'boolean'], 'sales-order line archive RPC exists');
select hasnt_function('public', 'delete_sales_order_line', array['uuid'], 'sales-order lines have no hard-delete RPC');
select has_function('private', 'validate_sales_order_line_mutation', array[]::text[], 'sales-order line mutation guard exists');
select has_trigger('public', 'sales_order_line_items', 'sales_order_line_items_mutation_guard', 'all sales-order line mutations enforce lifecycle rules');
select ok(
  not (select prosecdef from pg_proc where oid = 'private.validate_sales_order_line_mutation()'::regprocedure),
  'sales-order line mutation guard retains caller RLS'
);
select has_trigger('public', 'production_events', 'production_event_archive_guard', 'archived work orders reject production events');
select has_trigger('public', 'work_orders', 'work_order_sales_order_archive_guard', 'archived sales orders and lines reject new work orders');
select ok(not has_table_privilege('authenticated', 'public.sales_order_line_items', 'DELETE'), 'authenticated users cannot hard-delete sales-order lines');
select matches(pg_get_functiondef('private.customer_portal_sales_order_lines()'::regprocedure), 'archived_at is null', 'customer portal omits archived sales-order lines');
select matches(pg_get_functiondef('private.customer_portal_work_orders()'::regprocedure), 'archived_at is null', 'customer portal omits archived work orders');
select has_function('private', 'mark_customer_message_thread_read', array[]::text[], 'message reply read-state trigger function exists');
select has_trigger('public', 'customer_messages', 'customer_messages_mark_thread_read', 'message reply read-state trigger exists');
select ok(
  not (select prosecdef from pg_proc where oid = 'private.mark_customer_message_thread_read()'::regprocedure),
  'message reply read-state trigger runs as the caller and retains RLS'
);
select ok(not has_column_privilege('authenticated', 'public.work_orders', 'completion_date', 'UPDATE'), 'authenticated users cannot manually update completion_date');
select matches((select qual::text from pg_policies where schemaname = 'public' and tablename = 'sales_orders' and policyname = 'sales_orders_select'), 'is_manufacturer', 'raw sales orders are manufacturer-only');
select matches((select qual::text from pg_policies where schemaname = 'public' and tablename = 'work_orders' and policyname = 'work_orders_select'), 'is_manufacturer', 'raw work orders are manufacturer-only');
select matches((select qual::text from pg_policies where schemaname = 'public' and tablename = 'production_events' and policyname = 'production_events_select'), 'is_manufacturer', 'raw production events are manufacturer-only');

-- Seed two customers while bypassing only the auth.users foreign key. The portal
-- functions must still isolate the authenticated customer at execution time.
set local session_replication_role = replica;
insert into public.organizations(id, name) values ('10000000-0000-0000-0000-000000000099', 'RLS test shop');
insert into public.customers(id, organization_id, customer_name) values
  ('20000000-0000-0000-0000-000000000091', '10000000-0000-0000-0000-000000000099', 'Customer A'),
  ('20000000-0000-0000-0000-000000000092', '10000000-0000-0000-0000-000000000099', 'Customer B');
insert into public.profiles(id, organization_id, customer_id, display_name, role) values
  ('30000000-0000-0000-0000-000000000091', '10000000-0000-0000-0000-000000000099', '20000000-0000-0000-0000-000000000091', 'Portal A', 'customer'),
  ('30000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000099', null, 'Shop User', 'manufacturer');
insert into public.sales_orders(id, organization_id, sales_order_number, sales_order_name, customer_id, customer_name, customer_po_number, date_received, order_due_date) values
  ('40000000-0000-0000-0000-000000000091', '10000000-0000-0000-0000-000000000099', 'SO-A', 'SO-A', '20000000-0000-0000-0000-000000000091', 'Customer A', 'PO-A', current_date, current_date + 7),
  ('40000000-0000-0000-0000-000000000092', '10000000-0000-0000-0000-000000000099', 'SO-B', 'SO-B', '20000000-0000-0000-0000-000000000092', 'Customer B', 'PO-B', current_date, current_date + 7);
insert into public.sales_order_line_items(id, sales_order_id, line_number, part_number, description, manufactured_item, pricing_type, quantity, unit_price, sort_order) values
  ('50000000-0000-0000-0000-000000000091', '40000000-0000-0000-0000-000000000091', 1, 'PART-A', 'Customer A part', true, 'per_piece', 10, 99.00, 1),
  ('50000000-0000-0000-0000-000000000092', '40000000-0000-0000-0000-000000000092', 1, 'PART-B', 'Customer B part', true, 'per_piece', 10, 199.00, 1);
insert into public.work_orders(id, organization_id, work_order_number, work_order_name, sales_order_id, sales_order_line_item_id, part_number, quantity_ordered, due_date) values
  ('60000000-0000-0000-0000-000000000091', '10000000-0000-0000-0000-000000000099', 'WO-A', 'WO-A', '40000000-0000-0000-0000-000000000091', '50000000-0000-0000-0000-000000000091', 'PART-A', 10, current_date + 7),
  ('60000000-0000-0000-0000-000000000092', '10000000-0000-0000-0000-000000000099', 'WO-B', 'WO-B', '40000000-0000-0000-0000-000000000092', '50000000-0000-0000-0000-000000000092', 'PART-B', 10, current_date + 7);
insert into public.routing_steps(id, work_order_id, sequence_number, routing_step_name, customer_stage_name) values
  ('70000000-0000-0000-0000-000000000091', '60000000-0000-0000-0000-000000000091', 10, 'Secret A operation', 'In production'),
  ('70000000-0000-0000-0000-000000000092', '60000000-0000-0000-0000-000000000092', 10, 'Secret B operation', 'In production');
insert into public.customer_stage_mappings(routing_step_id, work_order_id, sequence_number, customer_stage_name) values
  ('70000000-0000-0000-0000-000000000091', '60000000-0000-0000-0000-000000000091', 10, 'In production'),
  ('70000000-0000-0000-0000-000000000092', '60000000-0000-0000-0000-000000000092', 10, 'In production');
insert into public.production_events(id, organization_id, work_order_id, routing_step_id, event_type, quantity, to_routing_step_id) values
  ('80000000-0000-0000-0000-000000000091', '10000000-0000-0000-0000-000000000099', '60000000-0000-0000-0000-000000000091', '70000000-0000-0000-0000-000000000091', 'release', 10, '70000000-0000-0000-0000-000000000091');
insert into public.customer_messages(id, organization_id, customer_id, sales_order_id, sender_type, message) values
  ('90000000-0000-0000-0000-000000000091', '10000000-0000-0000-0000-000000000099', '20000000-0000-0000-0000-000000000091', '40000000-0000-0000-0000-000000000091', 'customer', 'Question A'),
  ('90000000-0000-0000-0000-000000000092', '10000000-0000-0000-0000-000000000099', '20000000-0000-0000-0000-000000000092', '40000000-0000-0000-0000-000000000092', 'customer', 'Question B');
set local session_replication_role = origin;

set local role authenticated;
set local request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000091","role":"authenticated"}';
select is((select count(*)::integer from public.sales_orders), 0, 'customer cannot query raw sales orders');
select is((select count(*)::integer from public.production_events), 0, 'customer cannot query raw production events');
select throws_ok(
  $$select public.add_sales_order_line('40000000-0000-0000-0000-000000000091', '{"part_number":"PART-A2","description":"Added part","manufactured_item":true,"pricing_type":"per_piece","quantity":5,"unit_price":25,"flat_rate_amount":null}'::jsonb)$$,
  'P0001',
  'Sales order not found or access denied',
  'customer cannot append a sales-order line'
);
select throws_ok(
  $$select public.set_sales_order_archived('40000000-0000-0000-0000-000000000091', true)$$,
  'P0001',
  'Sales order not found or access denied',
  'customer cannot archive a sales order'
);
update public.sales_orders set shipped_at = now(), invoiced_at = now();
select is((select count(*)::integer from public.customer_portal_sales_orders()), 1, 'customer portal returns only its own sales order');
select is((select sales_order_name from public.customer_portal_sales_orders()), 'SO-A', 'customer portal identifies sales orders by name');
select ok((select shipped_at is null and invoiced_at is null from public.customer_portal_sales_orders()), 'customer portal returns fulfillment milestones');
select is((select count(*)::integer from public.customer_portal_sales_order_lines()), 1, 'customer portal returns only its own safe line item');
select is((select count(*)::integer from public.customer_portal_work_orders()), 1, 'customer portal returns only its own aggregate work order');
select is((select count(*)::integer from public.customer_messages), 1, 'customer messages are isolated by customer account');

set local request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000099","role":"authenticated"}';
select is((select count(*)::integer from public.sales_orders), 2, 'manufacturer can query organization sales orders');
select is((select count(*)::integer from public.sales_orders where shipped_at is not null or invoiced_at is not null), 0, 'customer cannot mark fulfillment milestones');
select lives_ok(
  $$select public.add_sales_order_line('40000000-0000-0000-0000-000000000091', '{"part_number":"PART-A2","description":"Added part","manufactured_item":true,"pricing_type":"per_piece","quantity":5,"unit_price":25,"flat_rate_amount":null}'::jsonb)$$,
  'manufacturer can append a line before invoicing'
);
select is((select max(line_number) from public.sales_order_line_items where sales_order_id = '40000000-0000-0000-0000-000000000091'), 2, 'appended line receives the next line number');
select is((select max(sort_order) from public.sales_order_line_items where sales_order_id = '40000000-0000-0000-0000-000000000091'), 11, 'appended line receives the next sort position');
select lives_ok(
  $$select public.update_sales_order_line((select id from public.sales_order_line_items where sales_order_id = '40000000-0000-0000-0000-000000000091' and line_number = 2), '{"part_number":"PART-A2","description":"Corrected added part","manufactured_item":true,"pricing_type":"per_piece","quantity":6,"unit_price":25,"flat_rate_amount":null}'::jsonb)$$,
  'manufacturer can edit an unlinked line before invoicing'
);
select is((select description from public.sales_order_line_items where sales_order_id = '40000000-0000-0000-0000-000000000091' and line_number = 2), 'Corrected added part', 'line edit is persisted');
select lives_ok(
  $$select public.set_sales_order_line_archived((select id from public.sales_order_line_items where sales_order_id = '40000000-0000-0000-0000-000000000091' and line_number = 2), true)$$,
  'manufacturer can archive an unlinked line'
);
select ok((select archived_at is not null from public.sales_order_line_items where sales_order_id = '40000000-0000-0000-0000-000000000091' and line_number = 2), 'line archive timestamp is recorded');
select lives_ok(
  $$select public.set_sales_order_line_archived((select id from public.sales_order_line_items where sales_order_id = '40000000-0000-0000-0000-000000000091' and line_number = 2), false)$$,
  'manufacturer can restore an archived line'
);
select throws_ok(
  $$select public.set_sales_order_line_archived('50000000-0000-0000-0000-000000000091', true)$$,
  'P0001',
  'Archive is unavailable while a work order is linked to this line item',
  'linked sales-order lines cannot be archived'
);
select lives_ok(
  $$select public.set_sales_order_archived('40000000-0000-0000-0000-000000000091', true)$$,
  'manufacturer can archive a sales order'
);
select ok((select archived_at is not null from public.sales_orders where id = '40000000-0000-0000-0000-000000000091'), 'sales-order archive timestamp is recorded');
select lives_ok(
  $$select public.set_sales_order_archived('40000000-0000-0000-0000-000000000091', false)$$,
  'manufacturer can restore a sales order'
);
select lives_ok(
  $$select public.set_work_order_archived('60000000-0000-0000-0000-000000000091', true)$$,
  'manufacturer can archive a work order'
);
select ok((select archived_at is not null from public.work_orders where id = '60000000-0000-0000-0000-000000000091'), 'work-order archive timestamp is recorded');
select throws_ok(
  $$select public.record_production_event('60000000-0000-0000-0000-000000000091', '70000000-0000-0000-0000-000000000091', 'transfer', 1, null)$$,
  'P0001',
  'Restore the work order before recording production',
  'archived work orders reject production events'
);
select lives_ok(
  $$select public.set_work_order_archived('60000000-0000-0000-0000-000000000091', false)$$,
  'manufacturer can restore a work order'
);
update public.sales_orders set shipped_at = now(), invoiced_at = now() where id = '40000000-0000-0000-0000-000000000091';
select ok((select shipped_at is not null and invoiced_at is not null from public.sales_orders where id = '40000000-0000-0000-0000-000000000091'), 'manufacturer can mark fulfillment milestones');
select throws_ok(
  $$select public.add_sales_order_line('40000000-0000-0000-0000-000000000091', '{"part_number":null,"description":"Late fee","manufactured_item":false,"pricing_type":"flat_rate","quantity":1,"unit_price":null,"flat_rate_amount":50}'::jsonb)$$,
  'P0001',
  'Line items cannot be added after the sales order is invoiced',
  'manufacturer cannot append a line after invoicing'
);
select throws_ok(
  $$insert into public.sales_order_line_items(sales_order_id, line_number, description, manufactured_item, pricing_type, quantity, flat_rate_amount, sort_order) values ('40000000-0000-0000-0000-000000000091', 3, 'Direct late fee', false, 'flat_rate', 1, 50, 21)$$,
  'P0001',
  'Line items cannot be changed after the sales order is invoiced',
  'invoice lock also blocks direct table inserts'
);
select is((select count(*)::integer from public.production_events), 1, 'manufacturer can query organization production events');
insert into public.customer_messages(id, organization_id, customer_id, sales_order_id, sender_type, message, created_by) values
  ('90000000-0000-0000-0000-000000000093', '10000000-0000-0000-0000-000000000099', '20000000-0000-0000-0000-000000000091', '40000000-0000-0000-0000-000000000091', 'manufacturer', 'Response A', null);
select ok((select read_at is not null from public.customer_messages where id = '90000000-0000-0000-0000-000000000091'), 'manufacturer reply clears the incoming-message notification');
select ok((select read_at is null from public.customer_messages where id = '90000000-0000-0000-0000-000000000092'), 'reply does not clear another order thread');
reset role;

select * from finish();
rollback;
