-- Harden released ERP write contracts without changing existing route, bucket, or RPC identifiers.

alter table public.production_events
  add column actor_id uuid,
  add column request_id uuid;

alter table public.sales_orders
  add column creation_request_id uuid,
  add column creation_request_hash text;

alter table public.work_orders
  add column creation_request_id uuid,
  add column creation_request_hash text;

alter table public.sales_order_line_items
  add column creation_request_id uuid,
  add column creation_request_hash text;

-- Existing history predates client-provided request identifiers. Backfill only the
-- technical retry key; unknown historical actors intentionally remain null.
update public.production_events
set request_id = gen_random_uuid()
where event_type not in ('release', 'reversal')
  and request_id is null;

alter table public.production_events
  add constraint production_events_request_id_required_check
  check (event_type in ('release', 'reversal') or request_id is not null);

create unique index production_events_organization_request_id_idx
  on public.production_events(organization_id, request_id)
  where request_id is not null;

create unique index sales_orders_organization_creation_request_idx
  on public.sales_orders(organization_id, creation_request_id)
  where creation_request_id is not null;

create unique index work_orders_organization_creation_request_idx
  on public.work_orders(organization_id, creation_request_id)
  where creation_request_id is not null;

create unique index sales_order_lines_order_creation_request_idx
  on public.sales_order_line_items(sales_order_id, creation_request_id)
  where creation_request_id is not null;

comment on column public.production_events.actor_id is
  'Authenticated actor captured by PostgreSQL when the event is posted; null only for historical or legitimate system activity.';
comment on column public.production_events.request_id is
  'Durable client request identifier used to make production posting idempotent.';
comment on column public.sales_orders.creation_request_id is
  'Client request identifier for idempotent sales-order creation.';
comment on column public.work_orders.creation_request_id is
  'Client request identifier for idempotent work-order creation.';
comment on column public.sales_order_line_items.creation_request_id is
  'Client request identifier for idempotent line creation.';

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entity_type text not null check (length(btrim(entity_type)) > 0),
  entity_id uuid not null,
  record_id uuid not null,
  operation text not null check (length(btrim(operation)) > 0),
  actor_id uuid,
  diff jsonb not null check (jsonb_typeof(diff) = 'object'),
  source text not null check (length(btrim(source)) > 0),
  request_id uuid,
  created_at timestamptz not null default now()
);

create index audit_log_organization_created_idx
  on public.audit_log(organization_id, created_at desc);
create index audit_log_entity_idx
  on public.audit_log(organization_id, entity_type, entity_id, created_at desc);
create index audit_log_actor_idx
  on public.audit_log(actor_id, created_at desc)
  where actor_id is not null;
create index audit_log_request_idx
  on public.audit_log(organization_id, request_id)
  where request_id is not null;

alter table public.audit_log enable row level security;
revoke all on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;

create policy audit_log_select
on public.audit_log
for select
to authenticated
using ((select private.is_manufacturer(organization_id)));

comment on table public.audit_log is
  'Append-only, organization-scoped history for consequential ERP record and posting changes.';

create or replace function private.capture_erp_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_diff jsonb;
  v_organization_id uuid;
  v_entity_id uuid;
  v_record_id uuid;
  v_operation text := tg_op;
  v_request_id uuid;
  v_source text := coalesce(
    nullif(current_setting('shopcore.audit_source', true), ''),
    case when auth.uid() is null then 'database' else 'data_api' end
  );
begin
  v_old := v_old - array['created_at', 'updated_at', 'uploaded_at', 'upload_attested_at', 'creation_request_hash'];
  v_new := v_new - array['created_at', 'updated_at', 'uploaded_at', 'upload_attested_at', 'creation_request_hash'];

  if tg_op = 'UPDATE' then
    select coalesce(
      jsonb_object_agg(changed.key, jsonb_build_object('old', v_old -> changed.key, 'new', v_new -> changed.key)),
      '{}'::jsonb
    )
    into v_diff
    from (
      select key
      from jsonb_object_keys(v_old || v_new) as keys(key)
      where v_old -> key is distinct from v_new -> key
    ) as changed;

    if v_diff = '{}'::jsonb then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    v_diff := jsonb_build_object('new', v_new);
  else
    v_diff := jsonb_build_object('old', v_old);
  end if;

  if tg_table_name = 'profiles' then
    v_organization_id := coalesce(new.organization_id, old.organization_id);
    v_entity_id := v_organization_id;
    v_record_id := coalesce(new.id, old.id);
  elsif tg_table_name = 'customers' then
    v_organization_id := coalesce(new.organization_id, old.organization_id);
    v_entity_id := coalesce(new.id, old.id);
    v_record_id := v_entity_id;
  elsif tg_table_name = 'sales_orders' then
    v_organization_id := coalesce(new.organization_id, old.organization_id);
    v_entity_id := coalesce(new.id, old.id);
    v_record_id := v_entity_id;
    v_request_id := coalesce(new.creation_request_id, old.creation_request_id);
  elsif tg_table_name = 'sales_order_line_items' then
    select sales_order.organization_id
      into strict v_organization_id
    from public.sales_orders as sales_order
    where sales_order.id = coalesce(new.sales_order_id, old.sales_order_id);
    v_entity_id := coalesce(new.sales_order_id, old.sales_order_id);
    v_record_id := coalesce(new.id, old.id);
    v_request_id := coalesce(new.creation_request_id, old.creation_request_id);
  elsif tg_table_name = 'work_orders' then
    v_organization_id := coalesce(new.organization_id, old.organization_id);
    v_entity_id := coalesce(new.id, old.id);
    v_record_id := v_entity_id;
    v_request_id := coalesce(new.creation_request_id, old.creation_request_id);
  elsif tg_table_name = 'routing_steps' then
    select work_order.organization_id
      into strict v_organization_id
    from public.work_orders as work_order
    where work_order.id = coalesce(new.work_order_id, old.work_order_id);
    v_entity_id := coalesce(new.work_order_id, old.work_order_id);
    v_record_id := coalesce(new.id, old.id);
  elsif tg_table_name = 'production_events' then
    v_organization_id := coalesce(new.organization_id, old.organization_id);
    v_entity_id := coalesce(new.work_order_id, old.work_order_id);
    v_record_id := coalesce(new.id, old.id);
    v_operation := upper(coalesce(new.event_type, old.event_type));
    v_request_id := coalesce(new.request_id, old.request_id);
  elsif tg_table_name = 'customer_documents' then
    v_organization_id := coalesce(new.organization_id, old.organization_id);
    v_entity_id := coalesce(new.customer_id, old.customer_id);
    v_record_id := coalesce(new.id, old.id);
  else
    raise exception 'Unsupported audit source table: %', tg_table_name;
  end if;

  insert into public.audit_log(
    organization_id,
    entity_type,
    entity_id,
    record_id,
    operation,
    actor_id,
    diff,
    source,
    request_id
  ) values (
    v_organization_id,
    tg_table_name,
    v_entity_id,
    v_record_id,
    v_operation,
    auth.uid(),
    v_diff,
    v_source,
    v_request_id
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.capture_erp_audit() from public, anon, authenticated;

create trigger profiles_audit
after insert or update or delete on public.profiles
for each row execute function private.capture_erp_audit();
create trigger customers_audit
after insert or update or delete on public.customers
for each row execute function private.capture_erp_audit();
create trigger sales_orders_audit
after insert or update or delete on public.sales_orders
for each row execute function private.capture_erp_audit();
create trigger sales_order_line_items_audit
after insert or update or delete on public.sales_order_line_items
for each row execute function private.capture_erp_audit();
create trigger work_orders_audit
after insert or update or delete on public.work_orders
for each row execute function private.capture_erp_audit();
create trigger routing_steps_audit
after insert or update or delete on public.routing_steps
for each row execute function private.capture_erp_audit();
create trigger production_events_audit
after insert on public.production_events
for each row execute function private.capture_erp_audit();
create trigger customer_documents_audit
after insert or update or delete on public.customer_documents
for each row execute function private.capture_erp_audit();

create or replace function private.enforce_message_provenance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  new.read_at := null;
  return new;
end;
$$;

create trigger customer_messages_provenance
before insert on public.customer_messages
for each row execute function private.enforce_message_provenance();

create or replace function private.enforce_document_provenance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if split_part(new.file_path, '/', 1) <> new.organization_id::text
    or split_part(new.file_path, '/', 2) <> new.customer_id::text
    or split_part(new.file_path, '/', 3) = ''
    or split_part(new.file_path, '/', 4) <> '' then
    raise exception using errcode = '23514', message = 'Document path must match organization/customer/random-document.pdf';
  end if;

  new.uploaded_by := auth.uid();
  new.uploaded_at := now();
  new.upload_attested_at := now();
  return new;
end;
$$;

create trigger customer_documents_provenance
before insert on public.customer_documents
for each row execute function private.enforce_document_provenance();

revoke all on function private.enforce_message_provenance() from public, anon, authenticated;
revoke all on function private.enforce_document_provenance() from public, anon, authenticated;

alter table public.customer_documents
  add constraint customer_documents_file_path_scope_check
  check (
    split_part(file_path, '/', 1) = organization_id::text
    and split_part(file_path, '/', 2) = customer_id::text
    and split_part(file_path, '/', 3) <> ''
    and split_part(file_path, '/', 4) = ''
  );

drop policy invoice_objects_insert on storage.objects;
create policy invoice_objects_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'invoices'
  and lower(storage.extension(name)) = 'pdf'
  and coalesce(metadata ->> 'mimetype', '') = 'application/pdf'
  and array_length(storage.foldername(name), 1) = 2
  and exists (
    select 1
    from public.customers as customer
    where customer.organization_id::text = (storage.foldername(name))[1]
      and customer.id::text = (storage.foldername(name))[2]
      and (select private.is_manufacturer(customer.organization_id))
  )
);

-- Set trusted production provenance at the validation boundary.
create or replace function private.validate_production_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_order public.work_orders%rowtype;
  v_step public.routing_steps%rowtype;
  v_available integer;
  v_original public.production_events%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.work_order_id::text, 0));
  select * into strict v_work_order from public.work_orders where id = new.work_order_id;
  select * into strict v_step from public.routing_steps where id = new.routing_step_id and work_order_id = new.work_order_id;
  new.organization_id := v_work_order.organization_id;
  new.actor_id := auth.uid();
  new.created_at := now();

  if new.event_type = 'reversal' then
    select * into strict v_original
    from public.production_events
    where id = new.reversed_event_id
      and work_order_id = new.work_order_id
      and event_type in ('transfer', 'scrap');
    if exists (select 1 from public.production_events where reversed_event_id = v_original.id) then
      raise exception 'Event has already been reversed';
    end if;
    if v_original.created_at < now() - interval '5 minutes' then
      raise exception 'The undo window for this transaction has expired';
    end if;
    new.quantity := v_original.quantity;
    new.routing_step_id := v_original.routing_step_id;
    new.from_routing_step_id := v_original.from_routing_step_id;
    new.to_routing_step_id := v_original.to_routing_step_id;
    return new;
  end if;

  if new.event_type in ('release', 'adjustment') and exists (
    select 1 from public.routing_steps where work_order_id = new.work_order_id and sequence_number < v_step.sequence_number
  ) then
    raise exception 'Release and adjustment events belong to the first routing step';
  end if;

  if new.event_type in ('transfer', 'scrap') then
    select coalesce(sum(delta), 0)::integer into v_available from (
      select case
        when pe.event_type in ('release', 'adjustment') and pe.routing_step_id = new.routing_step_id then pe.quantity
        when pe.event_type = 'transfer' and pe.to_routing_step_id = new.routing_step_id then pe.quantity
        when pe.event_type = 'transfer' and pe.from_routing_step_id = new.routing_step_id then -pe.quantity
        when pe.event_type = 'scrap' and pe.routing_step_id = new.routing_step_id then -pe.quantity
        else 0 end as delta
      from public.production_events pe
      where pe.work_order_id = new.work_order_id and pe.event_type <> 'reversal'
        and not exists (select 1 from public.production_events reversal where reversal.reversed_event_id = pe.id)
    ) balances;
    if new.quantity > v_available then
      raise exception 'Only % units are available at this routing step', v_available;
    end if;
  end if;

  if new.event_type = 'transfer' and new.to_routing_step_id is not null and not exists (
    select 1
    from public.routing_steps next_step
    where next_step.id = new.to_routing_step_id
      and next_step.work_order_id = new.work_order_id
      and next_step.sequence_number = (
        select min(candidate.sequence_number)
        from public.routing_steps candidate
        where candidate.work_order_id = new.work_order_id and candidate.sequence_number > v_step.sequence_number
      )
  ) then
    raise exception 'Transfer destination must be the next routing step on the same work order';
  end if;

  if new.event_type = 'transfer' and new.to_routing_step_id is null and exists (
    select 1 from public.routing_steps later_step
    where later_step.work_order_id = new.work_order_id and later_step.sequence_number > v_step.sequence_number
  ) then
    raise exception 'Only the final routing step can transfer to complete';
  end if;

  return new;
end;
$$;

create or replace function private.record_production_event(
  p_work_order_id uuid,
  p_routing_step_id uuid,
  p_event_type text,
  p_quantity integer,
  p_to_routing_step_id uuid,
  p_request_id uuid
)
returns public.production_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_event public.production_events;
  v_expected_from uuid := case when p_event_type = 'transfer' then p_routing_step_id else null end;
  v_expected_to uuid := case
    when p_event_type = 'transfer' then p_to_routing_step_id
    when p_event_type = 'adjustment' then p_routing_step_id
    else null
  end;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'A production request id is required';
  end if;
  if p_event_type not in ('transfer', 'scrap', 'adjustment') then
    raise exception using errcode = '22023', message = 'Unsupported production event type';
  end if;
  if p_quantity <= 0 then
    raise exception using errcode = '22023', message = 'Quantity must be greater than zero';
  end if;

  select work_order.organization_id
    into v_organization_id
  from public.work_orders as work_order
  where work_order.id = p_work_order_id;

  if not found or not (select private.is_manufacturer(v_organization_id)) then
    raise exception using errcode = 'P0001', message = 'Work order not found or access denied';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('production_request:' || p_request_id::text, 0));

  select event.*
    into v_event
  from public.production_events as event
  where event.organization_id = v_organization_id
    and event.request_id = p_request_id;

  if found then
    if v_event.work_order_id is distinct from p_work_order_id
      or v_event.routing_step_id is distinct from p_routing_step_id
      or v_event.event_type is distinct from p_event_type
      or v_event.quantity is distinct from p_quantity
      or v_event.from_routing_step_id is distinct from v_expected_from
      or v_event.to_routing_step_id is distinct from v_expected_to then
      raise exception using errcode = '22023', message = 'Production request id was already used for a different transaction';
    end if;
    return v_event;
  end if;

  perform set_config('shopcore.audit_source', 'record_production_event_v2', true);
  insert into public.production_events(
    organization_id,
    work_order_id,
    routing_step_id,
    event_type,
    quantity,
    from_routing_step_id,
    to_routing_step_id,
    request_id
  ) values (
    v_organization_id,
    p_work_order_id,
    p_routing_step_id,
    p_event_type,
    p_quantity,
    v_expected_from,
    v_expected_to,
    p_request_id
  )
  returning * into v_event;

  return v_event;
end;
$$;

create or replace function public.record_production_event(
  p_work_order_id uuid,
  p_routing_step_id uuid,
  p_event_type text,
  p_quantity integer,
  p_to_routing_step_id uuid default null
)
returns public.production_events
language sql
security invoker
set search_path = ''
as $$
  select private.record_production_event(
    p_work_order_id,
    p_routing_step_id,
    p_event_type,
    p_quantity,
    p_to_routing_step_id,
    gen_random_uuid()
  );
$$;

create function public.record_production_event_v2(
  p_work_order_id uuid,
  p_routing_step_id uuid,
  p_event_type text,
  p_quantity integer,
  p_to_routing_step_id uuid,
  p_request_id uuid
)
returns public.production_events
language sql
security invoker
set search_path = ''
as $$
  select private.record_production_event(
    p_work_order_id,
    p_routing_step_id,
    p_event_type,
    p_quantity,
    p_to_routing_step_id,
    p_request_id
  );
$$;

comment on function public.record_production_event(uuid, uuid, text, integer, uuid) is
  'STABLE compatibility RPC. New ShopCore callers use record_production_event_v2 for retry-safe posting.';
comment on function public.record_production_event_v2(uuid, uuid, text, integer, uuid, uuid) is
  'STABLE retry-safe production posting contract. A request id can be replayed only with the same payload.';

create or replace function private.reverse_production_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.production_events;
begin
  select event.*
    into v_original
  from public.production_events as event
  where event.id = p_event_id;

  if not found or not (select private.is_manufacturer(v_original.organization_id)) then
    raise exception using errcode = 'P0001', message = 'Production event not found or access denied';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_original.work_order_id::text, 0));

  if exists (select 1 from public.production_events where reversed_event_id = v_original.id) then
    return;
  end if;

  perform set_config('shopcore.audit_source', 'reverse_production_event', true);
  insert into public.production_events(
    organization_id,
    work_order_id,
    routing_step_id,
    event_type,
    quantity,
    reversed_event_id
  ) values (
    v_original.organization_id,
    v_original.work_order_id,
    v_original.routing_step_id,
    'reversal',
    v_original.quantity,
    v_original.id
  );
end;
$$;

create or replace function public.reverse_production_event(p_event_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.reverse_production_event(p_event_id);
$$;

create function public.production_step_snapshot(
  p_work_order_id uuid,
  p_routing_step_id uuid
)
returns table (
  work_order_id uuid,
  work_order_name text,
  part_number text,
  archived_at timestamptz,
  step_id uuid,
  sequence_number integer,
  routing_step_name text,
  available integer,
  transferred integer,
  scrapped integer,
  next_step_id uuid,
  next_step_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with active_events as (
    select event.*
    from public.production_events as event
    where event.work_order_id = p_work_order_id
      and event.event_type <> 'reversal'
      and not exists (
        select 1
        from public.production_events as reversal
        where reversal.reversed_event_id = event.id
      )
  ), step_totals as (
    select
      coalesce(sum(event.quantity) filter (
        where (event.event_type in ('release', 'adjustment') and event.routing_step_id = p_routing_step_id)
           or (event.event_type = 'transfer' and event.to_routing_step_id = p_routing_step_id)
      ), 0)::integer as entered,
      coalesce(sum(event.quantity) filter (
        where event.event_type = 'transfer' and event.from_routing_step_id = p_routing_step_id
      ), 0)::integer as transferred,
      coalesce(sum(event.quantity) filter (
        where event.event_type = 'scrap' and event.routing_step_id = p_routing_step_id
      ), 0)::integer as scrapped
    from active_events as event
  )
  select
    work_order.id,
    work_order.work_order_name,
    work_order.part_number,
    work_order.archived_at,
    step.id,
    step.sequence_number,
    step.routing_step_name,
    totals.entered - totals.transferred - totals.scrapped,
    totals.transferred,
    totals.scrapped,
    next_step.id,
    next_step.routing_step_name
  from public.work_orders as work_order
  join public.routing_steps as step
    on step.id = p_routing_step_id
   and step.work_order_id = work_order.id
  cross join step_totals as totals
  left join lateral (
    select candidate.id, candidate.routing_step_name
    from public.routing_steps as candidate
    where candidate.work_order_id = work_order.id
      and candidate.sequence_number > step.sequence_number
    order by candidate.sequence_number
    limit 1
  ) as next_step on true
  where work_order.id = p_work_order_id;
$$;

comment on function public.production_step_snapshot(uuid, uuid) is
  'STABLE minimal shop-floor read contract for a single QR work-order routing step.';

-- Keep the existing JSON RPC signatures while adding optional request_id fields.
create or replace function private.create_sales_order(p_order jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_line jsonb;
  v_organization_id uuid := (p_order ->> 'organization_id')::uuid;
  v_customer_id uuid := (p_order ->> 'customer_id')::uuid;
  v_request_id uuid := coalesce(nullif(p_order ->> 'request_id', '')::uuid, gen_random_uuid());
  v_request_hash text := md5((p_order - 'request_id')::text || p_lines::text);
  v_existing_hash text;
begin
  if not (select private.is_manufacturer(v_organization_id)) then
    raise exception using errcode = 'P0001', message = 'Organization not found or access denied';
  end if;
  if not exists (
    select 1 from public.customers
    where id = v_customer_id and organization_id = v_organization_id
  ) then
    raise exception using errcode = 'P0001', message = 'Customer not found or access denied';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one sales-order line is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sales_order_request:' || v_request_id::text, 0));
  select id, creation_request_hash
    into v_order_id, v_existing_hash
  from public.sales_orders
  where organization_id = v_organization_id and creation_request_id = v_request_id;
  if found then
    if v_existing_hash is distinct from v_request_hash then
      raise exception using errcode = '22023', message = 'Sales-order request id was already used for a different order';
    end if;
    return v_order_id;
  end if;

  perform set_config('shopcore.audit_source', 'create_sales_order', true);
  insert into public.sales_orders(
    organization_id, sales_order_name, customer_id, customer_name, customer_address,
    customer_po_number, ship_to_address, bill_to_address, date_received, order_due_date,
    notes, creation_request_id, creation_request_hash
  ) values (
    v_organization_id,
    coalesce(nullif(btrim(p_order ->> 'sales_order_name'), ''), nullif(btrim(p_order ->> 'sales_order_number'), '')),
    v_customer_id,
    p_order ->> 'customer_name',
    coalesce(p_order ->> 'customer_address', ''),
    p_order ->> 'customer_po_number',
    coalesce(p_order ->> 'ship_to_address', ''),
    coalesce(p_order ->> 'bill_to_address', ''),
    (p_order ->> 'date_received')::date,
    (p_order ->> 'order_due_date')::date,
    coalesce(p_order ->> 'notes', ''),
    v_request_id,
    v_request_hash
  ) returning id into v_order_id;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    insert into public.sales_order_line_items(
      sales_order_id, line_number, part_number, description, manufactured_item,
      pricing_type, quantity, unit_price, flat_rate_amount, sort_order
    ) values (
      v_order_id,
      (v_line ->> 'line_number')::integer,
      nullif(v_line ->> 'part_number', ''),
      v_line ->> 'description',
      (v_line ->> 'manufactured_item')::boolean,
      v_line ->> 'pricing_type',
      (v_line ->> 'quantity')::integer,
      nullif(v_line ->> 'unit_price', '')::numeric,
      nullif(v_line ->> 'flat_rate_amount', '')::numeric,
      (v_line ->> 'sort_order')::integer
    );
  end loop;

  return v_order_id;
end;
$$;

create or replace function public.create_sales_order(p_order jsonb, p_lines jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_sales_order(p_order, p_lines);
$$;

create or replace function private.create_work_order(p_work_order jsonb, p_routing jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_order_id uuid;
  v_step jsonb;
  v_step_id uuid;
  v_first_step_id uuid;
  v_organization_id uuid := (p_work_order ->> 'organization_id')::uuid;
  v_request_id uuid := coalesce(nullif(p_work_order ->> 'request_id', '')::uuid, gen_random_uuid());
  v_request_hash text := md5((p_work_order - 'request_id')::text || p_routing::text);
  v_existing_hash text;
begin
  if not (select private.is_manufacturer(v_organization_id)) then
    raise exception using errcode = 'P0001', message = 'Organization not found or access denied';
  end if;
  if jsonb_typeof(p_routing) <> 'array' or jsonb_array_length(p_routing) = 0 then
    raise exception 'At least one routing step is required';
  end if;
  if not exists (
    select 1
    from public.sales_order_line_items as line_item
    join public.sales_orders as sales_order on sales_order.id = line_item.sales_order_id
    where line_item.id = (p_work_order ->> 'sales_order_line_item_id')::uuid
      and sales_order.id = (p_work_order ->> 'sales_order_id')::uuid
      and sales_order.organization_id = v_organization_id
      and sales_order.archived_at is null
      and sales_order.invoiced_at is null
      and line_item.archived_at is null
      and line_item.manufactured_item
  ) then
    raise exception 'Work orders must be created from an active manufactured sales-order line';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('work_order_request:' || v_request_id::text, 0));
  select id, creation_request_hash
    into v_work_order_id, v_existing_hash
  from public.work_orders
  where organization_id = v_organization_id and creation_request_id = v_request_id;
  if found then
    if v_existing_hash is distinct from v_request_hash then
      raise exception using errcode = '22023', message = 'Work-order request id was already used for a different work order';
    end if;
    return v_work_order_id;
  end if;

  perform set_config('shopcore.audit_source', 'create_work_order', true);
  insert into public.work_orders(
    organization_id, work_order_name, sales_order_id, sales_order_line_item_id,
    part_number, quantity_ordered, due_date, notes, creation_request_id, creation_request_hash
  ) values (
    v_organization_id,
    coalesce(nullif(btrim(p_work_order ->> 'work_order_name'), ''), nullif(btrim(p_work_order ->> 'work_order_number'), '')),
    (p_work_order ->> 'sales_order_id')::uuid,
    (p_work_order ->> 'sales_order_line_item_id')::uuid,
    p_work_order ->> 'part_number',
    (p_work_order ->> 'quantity_ordered')::integer,
    (p_work_order ->> 'due_date')::date,
    coalesce(p_work_order ->> 'notes', ''),
    v_request_id,
    v_request_hash
  ) returning id into v_work_order_id;

  for v_step in
    select value from jsonb_array_elements(p_routing)
    order by (value ->> 'sequence_number')::integer
  loop
    insert into public.routing_steps(
      work_order_id, sequence_number, routing_step_name, customer_stage_name, work_instructions
    ) values (
      v_work_order_id,
      (v_step ->> 'sequence_number')::integer,
      v_step ->> 'routing_step_name',
      coalesce(v_step ->> 'customer_stage_name', 'In production'),
      coalesce(v_step ->> 'work_instructions', '')
    ) returning id into v_step_id;
    if v_first_step_id is null then v_first_step_id := v_step_id; end if;
  end loop;

  insert into public.production_events(
    organization_id, work_order_id, routing_step_id, event_type, quantity, to_routing_step_id
  ) values (
    v_organization_id, v_work_order_id, v_first_step_id, 'release',
    (p_work_order ->> 'quantity_ordered')::integer, v_first_step_id
  );

  return v_work_order_id;
end;
$$;

create or replace function public.create_work_order(p_work_order jsonb, p_routing jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_work_order(p_work_order, p_routing);
$$;

create or replace function private.add_sales_order_line(p_sales_order_id uuid, p_line jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_invoiced_at timestamptz;
  v_archived_at timestamptz;
  v_line_id uuid;
  v_line_number integer;
  v_sort_order integer;
  v_request_id uuid := coalesce(nullif(p_line ->> 'request_id', '')::uuid, gen_random_uuid());
  v_request_hash text := md5((p_line - 'request_id')::text);
  v_existing_hash text;
begin
  select organization_id, invoiced_at, archived_at
    into v_organization_id, v_invoiced_at, v_archived_at
  from public.sales_orders
  where id = p_sales_order_id
  for update;

  if not found or not (select private.is_manufacturer(v_organization_id)) then
    raise exception using errcode = 'P0001', message = 'Sales order not found or access denied';
  end if;
  if v_archived_at is not null then
    raise exception using errcode = 'P0001', message = 'Restore the sales order before changing line items';
  end if;
  if v_invoiced_at is not null then
    raise exception using errcode = 'P0001', message = 'Line items cannot be added after the sales order is invoiced';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sales_order_line_request:' || v_request_id::text, 0));
  select id, creation_request_hash
    into v_line_id, v_existing_hash
  from public.sales_order_line_items
  where sales_order_id = p_sales_order_id and creation_request_id = v_request_id;
  if found then
    if v_existing_hash is distinct from v_request_hash then
      raise exception using errcode = '22023', message = 'Sales-order line request id was already used for a different line';
    end if;
    return v_line_id;
  end if;

  select coalesce(max(line_number), 0) + 1, coalesce(max(sort_order), 0) + 10
    into v_line_number, v_sort_order
  from public.sales_order_line_items
  where sales_order_id = p_sales_order_id;

  perform set_config('shopcore.audit_source', 'add_sales_order_line', true);
  insert into public.sales_order_line_items(
    sales_order_id, line_number, part_number, description, manufactured_item,
    pricing_type, quantity, unit_price, flat_rate_amount, sort_order,
    creation_request_id, creation_request_hash
  ) values (
    p_sales_order_id,
    v_line_number,
    nullif(btrim(p_line ->> 'part_number'), ''),
    btrim(p_line ->> 'description'),
    coalesce((p_line ->> 'manufactured_item')::boolean, false),
    p_line ->> 'pricing_type',
    (p_line ->> 'quantity')::integer,
    nullif(p_line ->> 'unit_price', '')::numeric,
    nullif(p_line ->> 'flat_rate_amount', '')::numeric,
    v_sort_order,
    v_request_id,
    v_request_hash
  ) returning id into v_line_id;

  return v_line_id;
end;
$$;

create or replace function public.add_sales_order_line(p_sales_order_id uuid, p_line jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.add_sales_order_line(p_sales_order_id, p_line);
$$;

create or replace function private.set_sales_order_archived(p_sales_order_id uuid, p_archived boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_archived_at timestamptz;
begin
  select organization_id into v_organization_id
  from public.sales_orders where id = p_sales_order_id;
  if not found or not (select private.is_manufacturer(v_organization_id)) then
    raise exception using errcode = 'P0001', message = 'Sales order not found or access denied';
  end if;
  perform set_config('shopcore.audit_source', 'set_sales_order_archived', true);
  update public.sales_orders
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
  where id = p_sales_order_id
  returning archived_at into v_archived_at;
  return v_archived_at;
end;
$$;

create or replace function public.set_sales_order_archived(p_sales_order_id uuid, p_archived boolean)
returns timestamptz
language sql
security invoker
set search_path = ''
as $$
  select private.set_sales_order_archived(p_sales_order_id, p_archived);
$$;

create or replace function private.set_work_order_archived(p_work_order_id uuid, p_archived boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_archived_at timestamptz;
begin
  select organization_id into v_organization_id
  from public.work_orders where id = p_work_order_id;
  if not found or not (select private.is_manufacturer(v_organization_id)) then
    raise exception using errcode = 'P0001', message = 'Work order not found or access denied';
  end if;
  perform set_config('shopcore.audit_source', 'set_work_order_archived', true);
  update public.work_orders
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
  where id = p_work_order_id
  returning archived_at into v_archived_at;
  return v_archived_at;
end;
$$;

create or replace function public.set_work_order_archived(p_work_order_id uuid, p_archived boolean)
returns timestamptz
language sql
security invoker
set search_path = ''
as $$
  select private.set_work_order_archived(p_work_order_id, p_archived);
$$;

create function private.mark_sales_order_milestone(p_sales_order_id uuid, p_milestone text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.sales_orders%rowtype;
  v_timestamp timestamptz;
begin
  if p_milestone not in ('shipped', 'invoiced') then
    raise exception using errcode = '22023', message = 'Unsupported sales-order milestone';
  end if;
  select * into v_order from public.sales_orders where id = p_sales_order_id for update;
  if not found or not (select private.is_manufacturer(v_order.organization_id)) then
    raise exception using errcode = 'P0001', message = 'Sales order not found or access denied';
  end if;
  if v_order.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'Restore the sales order before updating fulfillment';
  end if;

  perform set_config('shopcore.audit_source', 'mark_sales_order_milestone', true);
  if p_milestone = 'shipped' then
    update public.sales_orders
    set shipped_at = coalesce(shipped_at, now())
    where id = p_sales_order_id
    returning shipped_at into v_timestamp;
  else
    update public.sales_orders
    set invoiced_at = coalesce(invoiced_at, now())
    where id = p_sales_order_id
    returning invoiced_at into v_timestamp;
  end if;
  return v_timestamp;
end;
$$;

create function public.mark_sales_order_milestone(p_sales_order_id uuid, p_milestone text)
returns timestamptz
language sql
security invoker
set search_path = ''
as $$
  select private.mark_sales_order_milestone(p_sales_order_id, p_milestone);
$$;

comment on function public.mark_sales_order_milestone(uuid, text) is
  'STABLE server-timestamped transition for independent shipped and invoiced confirmations.';

-- Compatibility bridge for the currently deployed client, which still writes milestone
-- columns directly. The trigger freezes every other header field and converts accepted
-- milestone/archive transitions to trusted database timestamps. Once all deployed clients
-- call the RPCs above, a later migration may replace this bridge with column revocation.
create function private.validate_sales_order_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.sales_order_number is distinct from old.sales_order_number
    or new.sales_order_name is distinct from old.sales_order_name
    or new.customer_id is distinct from old.customer_id
    or new.customer_name is distinct from old.customer_name
    or new.customer_address is distinct from old.customer_address
    or new.customer_po_number is distinct from old.customer_po_number
    or new.ship_to_address is distinct from old.ship_to_address
    or new.bill_to_address is distinct from old.bill_to_address
    or new.date_received is distinct from old.date_received
    or new.order_due_date is distinct from old.order_due_date
    or new.notes is distinct from old.notes
    or new.created_at is distinct from old.created_at
    or new.creation_request_id is distinct from old.creation_request_id
    or new.creation_request_hash is distinct from old.creation_request_hash then
    raise exception using errcode = 'P0001', message = 'Sales-order header fields are frozen after acceptance';
  end if;

  if old.archived_at is not null
    and (new.shipped_at is distinct from old.shipped_at or new.invoiced_at is distinct from old.invoiced_at) then
    raise exception using errcode = 'P0001', message = 'Restore the sales order before updating fulfillment';
  end if;

  if new.shipped_at is distinct from old.shipped_at then
    if old.shipped_at is not null or new.shipped_at is null then
      raise exception using errcode = 'P0001', message = 'Shipping confirmation cannot be cleared or replaced';
    end if;
    new.shipped_at := now();
  end if;

  if new.invoiced_at is distinct from old.invoiced_at then
    if old.invoiced_at is not null or new.invoiced_at is null then
      raise exception using errcode = 'P0001', message = 'Invoice confirmation cannot be cleared or replaced';
    end if;
    new.invoiced_at := now();
  end if;

  if new.archived_at is distinct from old.archived_at then
    new.archived_at := case when new.archived_at is null then null else now() end;
  end if;

  return new;
end;
$$;

create trigger sales_orders_mutation_guard
before update on public.sales_orders
for each row execute function private.validate_sales_order_mutation();

revoke all on function private.validate_sales_order_mutation() from public, anon, authenticated;

-- Public wrappers stay security-invoker; private implementations perform explicit,
-- fail-closed organization checks before their narrowly scoped security-definer writes.
revoke all on function private.record_production_event(uuid, uuid, text, integer, uuid, uuid) from public, anon;
revoke all on function private.reverse_production_event(uuid) from public, anon;
revoke all on function private.create_sales_order(jsonb, jsonb) from public, anon;
revoke all on function private.create_work_order(jsonb, jsonb) from public, anon;
revoke all on function private.add_sales_order_line(uuid, jsonb) from public, anon;
revoke all on function private.set_sales_order_archived(uuid, boolean) from public, anon;
revoke all on function private.set_work_order_archived(uuid, boolean) from public, anon;
revoke all on function private.mark_sales_order_milestone(uuid, text) from public, anon;

grant execute on function private.record_production_event(uuid, uuid, text, integer, uuid, uuid) to authenticated;
grant execute on function private.reverse_production_event(uuid) to authenticated;
grant execute on function private.create_sales_order(jsonb, jsonb) to authenticated;
grant execute on function private.create_work_order(jsonb, jsonb) to authenticated;
grant execute on function private.add_sales_order_line(uuid, jsonb) to authenticated;
grant execute on function private.set_sales_order_archived(uuid, boolean) to authenticated;
grant execute on function private.set_work_order_archived(uuid, boolean) to authenticated;
grant execute on function private.mark_sales_order_milestone(uuid, text) to authenticated;

revoke all on function public.record_production_event_v2(uuid, uuid, text, integer, uuid, uuid) from public, anon;
revoke all on function public.production_step_snapshot(uuid, uuid) from public, anon;
revoke all on function public.mark_sales_order_milestone(uuid, text) from public, anon;
grant execute on function public.record_production_event_v2(uuid, uuid, text, integer, uuid, uuid) to authenticated;
grant execute on function public.production_step_snapshot(uuid, uuid) to authenticated;
grant execute on function public.mark_sales_order_milestone(uuid, text) to authenticated;

-- Remove direct paths around atomic creation/posting and frozen Sales Order fields.
revoke insert on public.sales_orders from authenticated;
revoke insert on public.work_orders from authenticated;
revoke update(archived_at) on public.work_orders from authenticated;
revoke insert on public.routing_steps from authenticated;
revoke update on public.routing_steps from authenticated;
revoke insert on public.production_events from authenticated;
revoke insert on public.sales_order_line_items from authenticated;

-- Retain only business-editable columns on records that still use direct single-row writes.
revoke insert, update on public.customers from authenticated;
grant insert(organization_id, customer_name, logo_url, primary_address, default_ship_to_address, default_bill_to_address)
  on public.customers to authenticated;
grant update(customer_name, logo_url, primary_address, default_ship_to_address, default_bill_to_address)
  on public.customers to authenticated;

revoke update on public.sales_order_line_items from authenticated;
grant update(part_number, description, manufactured_item, pricing_type, quantity, unit_price, flat_rate_amount, archived_at)
  on public.sales_order_line_items to authenticated;

revoke insert on public.customer_messages from authenticated;
grant insert(organization_id, customer_id, sales_order_id, sender_type, message)
  on public.customer_messages to authenticated;

revoke insert on public.customer_documents from authenticated;
grant insert(organization_id, customer_id, sales_order_id, document_name, document_date, amount, file_path, document_type, upload_attestation_version)
  on public.customer_documents to authenticated;
