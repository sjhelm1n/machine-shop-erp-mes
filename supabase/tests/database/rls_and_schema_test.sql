begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

select has_table('public', 'organizations', 'organizations exists');
select has_table('public', 'customers', 'customers exists');
select has_table('public', 'sales_orders', 'sales_orders exists');
select has_table('public', 'work_orders', 'work_orders exists');
select has_table('public', 'production_events', 'production_events exists');
select has_table('public', 'customer_messages', 'customer_messages exists');
select has_table('public', 'invoices', 'invoices exists');

select ok((select relrowsecurity from pg_class where oid = 'public.sales_orders'::regclass), 'sales_orders has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.work_orders'::regclass), 'work_orders has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.production_events'::regclass), 'production_events has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.customer_messages'::regclass), 'customer_messages has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.invoices'::regclass), 'invoices has RLS enabled');

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
  'invoice bucket is private'
);

select hasnt_column('public', 'production_events', 'created_by', 'production events do not track operators');
select has_function('public', 'customer_portal_sales_orders', array[]::text[], 'customer sales-order portal RPC exists');
select has_function('public', 'customer_portal_sales_order_lines', array[]::text[], 'customer line-item portal RPC exists');
select has_function('public', 'customer_portal_work_orders', array[]::text[], 'customer work-order portal RPC exists');
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
insert into public.sales_orders(id, organization_id, sales_order_number, customer_id, customer_name, customer_po_number, date_received, order_due_date) values
  ('40000000-0000-0000-0000-000000000091', '10000000-0000-0000-0000-000000000099', 'SO-A', '20000000-0000-0000-0000-000000000091', 'Customer A', 'PO-A', current_date, current_date + 7),
  ('40000000-0000-0000-0000-000000000092', '10000000-0000-0000-0000-000000000099', 'SO-B', '20000000-0000-0000-0000-000000000092', 'Customer B', 'PO-B', current_date, current_date + 7);
insert into public.sales_order_line_items(id, sales_order_id, line_number, part_number, description, manufactured_item, pricing_type, quantity, unit_price, sort_order) values
  ('50000000-0000-0000-0000-000000000091', '40000000-0000-0000-0000-000000000091', 1, 'PART-A', 'Customer A part', true, 'per_piece', 10, 99.00, 1),
  ('50000000-0000-0000-0000-000000000092', '40000000-0000-0000-0000-000000000092', 1, 'PART-B', 'Customer B part', true, 'per_piece', 10, 199.00, 1);
insert into public.work_orders(id, organization_id, work_order_number, sales_order_id, sales_order_line_item_id, part_number, quantity_ordered, due_date) values
  ('60000000-0000-0000-0000-000000000091', '10000000-0000-0000-0000-000000000099', 'WO-A', '40000000-0000-0000-0000-000000000091', '50000000-0000-0000-0000-000000000091', 'PART-A', 10, current_date + 7),
  ('60000000-0000-0000-0000-000000000092', '10000000-0000-0000-0000-000000000099', 'WO-B', '40000000-0000-0000-0000-000000000092', '50000000-0000-0000-0000-000000000092', 'PART-B', 10, current_date + 7);
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
select is((select count(*)::integer from public.customer_portal_sales_orders()), 1, 'customer portal returns only its own sales order');
select is((select count(*)::integer from public.customer_portal_sales_order_lines()), 1, 'customer portal returns only its own safe line item');
select is((select count(*)::integer from public.customer_portal_work_orders()), 1, 'customer portal returns only its own aggregate work order');
select is((select count(*)::integer from public.customer_messages), 1, 'customer messages are isolated by customer account');

set local request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000099","role":"authenticated"}';
select is((select count(*)::integer from public.sales_orders), 2, 'manufacturer can query organization sales orders');
select is((select count(*)::integer from public.production_events), 1, 'manufacturer can query organization production events');
reset role;

select * from finish();
rollback;
