-- Lightweight complete-tool-assembly management. Tool assignments describe
-- requirements; checkout transactions describe physical crib movement.

create table public.tool_assemblies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  assembly_number text not null check (length(btrim(assembly_number)) between 1 and 80),
  description text not null check (length(btrim(description)) between 1 and 240),
  quantity_owned integer not null default 1 check (quantity_owned >= 0),
  notes text not null default '' check (length(notes) <= 2000),
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, assembly_number)
);

create table public.tool_checkout_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  tool_assembly_id uuid not null,
  transaction_type text not null check (transaction_type in ('CHECK_OUT', 'CHECK_IN')),
  quantity integer not null check (quantity > 0),
  note text not null default '' check (length(note) <= 500),
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  actor_display_name text not null check (length(btrim(actor_display_name)) between 1 and 120),
  request_id uuid not null,
  request_hash text not null,
  created_at timestamptz not null default now(),
  foreign key (tool_assembly_id, organization_id)
    references public.tool_assemblies(id, organization_id) on delete restrict,
  unique (organization_id, request_id)
);

create table public.routing_operation_tools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  routing_operation_id uuid not null references public.routing_template_steps(id) on delete cascade,
  tool_assembly_id uuid not null,
  tool_number text not null check (tool_number ~ '^T[0-9]{1,4}$'),
  notes text not null default '' check (length(notes) <= 500),
  sequence_number integer not null check (sequence_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tool_assembly_id, organization_id)
    references public.tool_assemblies(id, organization_id) on delete restrict,
  unique (routing_operation_id, tool_number),
  unique (routing_operation_id, sequence_number)
);

create table public.work_order_operation_tools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  work_order_operation_id uuid not null references public.routing_steps(id) on delete restrict,
  tool_assembly_id uuid not null,
  tool_number text not null check (tool_number ~ '^T[0-9]{1,4}$'),
  notes text not null default '' check (length(notes) <= 500),
  sequence_number integer not null check (sequence_number > 0),
  source_routing_operation_tool_id uuid references public.routing_operation_tools(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tool_assembly_id, organization_id)
    references public.tool_assemblies(id, organization_id) on delete restrict,
  unique (work_order_operation_id, tool_number),
  unique (work_order_operation_id, sequence_number)
);

create index tool_assemblies_active_number_idx
  on public.tool_assemblies(organization_id, archived_at, assembly_number);
create index tool_checkout_transactions_tool_created_idx
  on public.tool_checkout_transactions(tool_assembly_id, created_at desc, id desc);
create index tool_checkout_transactions_actor_idx
  on public.tool_checkout_transactions(actor_id) where actor_id is not null;
create index routing_operation_tools_operation_sequence_idx
  on public.routing_operation_tools(routing_operation_id, sequence_number);
create index routing_operation_tools_assembly_idx
  on public.routing_operation_tools(tool_assembly_id);
create index work_order_operation_tools_operation_sequence_idx
  on public.work_order_operation_tools(work_order_operation_id, sequence_number);
create index work_order_operation_tools_assembly_idx
  on public.work_order_operation_tools(tool_assembly_id);

create trigger tool_assemblies_updated_at before update on public.tool_assemblies
for each row execute function private.set_updated_at();
create trigger routing_operation_tools_updated_at before update on public.routing_operation_tools
for each row execute function private.set_updated_at();
create trigger work_order_operation_tools_updated_at before update on public.work_order_operation_tools
for each row execute function private.set_updated_at();

alter table public.tool_assemblies enable row level security;
alter table public.tool_checkout_transactions enable row level security;
alter table public.routing_operation_tools enable row level security;
alter table public.work_order_operation_tools enable row level security;

revoke all on public.tool_assemblies, public.tool_checkout_transactions,
  public.routing_operation_tools, public.work_order_operation_tools
from public, anon, authenticated;
grant select on public.tool_assemblies, public.tool_checkout_transactions,
  public.routing_operation_tools, public.work_order_operation_tools
to authenticated;

create policy tool_assemblies_select on public.tool_assemblies for select to authenticated
using ((select private.is_manufacturer(organization_id)));
create policy tool_checkout_transactions_select on public.tool_checkout_transactions for select to authenticated
using ((select private.is_manufacturer(organization_id)));
create policy routing_operation_tools_select on public.routing_operation_tools for select to authenticated
using ((select private.is_manufacturer(organization_id)));
create policy work_order_operation_tools_select on public.work_order_operation_tools for select to authenticated
using ((select private.is_manufacturer(organization_id)));

create or replace function private.validate_tooling_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_parent_organization_id uuid;
begin
  if tg_table_name = 'routing_operation_tools' then
    select template.organization_id into v_parent_organization_id
    from public.routing_template_steps operation
    join public.routing_templates template on template.id = operation.routing_template_id
    where operation.id = new.routing_operation_id;
  else
    select work_order.organization_id into v_parent_organization_id
    from public.routing_steps operation
    join public.work_orders work_order on work_order.id = operation.work_order_id
    where operation.id = new.work_order_operation_id;
  end if;
  if v_parent_organization_id is null or v_parent_organization_id <> new.organization_id then
    raise exception 'Tooling operation organization does not match';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_tooling_scope() from public, anon, authenticated;
create trigger routing_operation_tools_scope before insert or update on public.routing_operation_tools
for each row execute function private.validate_tooling_scope();
create trigger work_order_operation_tools_scope before insert or update on public.work_order_operation_tools
for each row execute function private.validate_tooling_scope();

create or replace function private.capture_tooling_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_organization_id uuid := coalesce(new.organization_id, old.organization_id);
  v_record_id uuid := coalesce(new.id, old.id);
  v_diff jsonb;
begin
  v_old := v_old - array['created_at', 'updated_at'];
  v_new := v_new - array['created_at', 'updated_at'];
  if tg_op = 'UPDATE' then
    select coalesce(
      jsonb_object_agg(changed.key, jsonb_build_object('old', v_old -> changed.key, 'new', v_new -> changed.key)),
      '{}'::jsonb
    ) into v_diff
    from (
      select key from jsonb_object_keys(v_old || v_new) keys(key)
      where v_old -> key is distinct from v_new -> key
    ) changed;
    if v_diff = '{}'::jsonb then return new; end if;
  elsif tg_op = 'INSERT' then v_diff := jsonb_build_object('new', v_new);
  else v_diff := jsonb_build_object('old', v_old);
  end if;
  insert into public.audit_log(
    organization_id, entity_type, entity_id, record_id, operation, actor_id, diff, source
  ) values (
    v_organization_id, tg_table_name, v_record_id, v_record_id, tg_op, auth.uid(), v_diff,
    coalesce(nullif(current_setting('shopcore.audit_source', true), ''),
      case when auth.uid() is null then 'database' else 'data_api' end)
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.capture_tooling_audit() from public, anon, authenticated;
create trigger tool_assemblies_audit after insert or update or delete on public.tool_assemblies
for each row execute function private.capture_tooling_audit();
create trigger tool_checkout_transactions_audit after insert on public.tool_checkout_transactions
for each row execute function private.capture_tooling_audit();
create trigger routing_operation_tools_audit after insert or update or delete on public.routing_operation_tools
for each row execute function private.capture_tooling_audit();
create trigger work_order_operation_tools_audit after insert or update or delete on public.work_order_operation_tools
for each row execute function private.capture_tooling_audit();

create or replace function public.save_tool_assembly(
  p_tool_assembly_id uuid, p_organization_id uuid, p_assembly_number text,
  p_description text, p_quantity_owned integer, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := coalesce(p_tool_assembly_id, gen_random_uuid()); v_checked_out integer;
begin
  if not (select private.is_manufacturer(p_organization_id)) then
    raise exception using errcode = 'P0001', message = 'Tool assembly not found or access denied';
  end if;
  if length(btrim(coalesce(p_assembly_number, ''))) not between 1 and 80 then raise exception 'Tool assembly number is required'; end if;
  if length(btrim(coalesce(p_description, ''))) not between 1 and 240 then raise exception 'Description is required'; end if;
  if p_quantity_owned is null or p_quantity_owned < 0 then raise exception 'Quantity owned cannot be negative'; end if;
  if exists (select 1 from public.tool_assemblies where id = v_id and organization_id <> p_organization_id) then
    raise exception using errcode = 'P0001', message = 'Tool assembly not found or access denied';
  end if;
  select coalesce(sum(case when transaction_type = 'CHECK_OUT' then quantity else -quantity end), 0)::integer
    into v_checked_out from public.tool_checkout_transactions where tool_assembly_id = v_id;
  if p_quantity_owned < v_checked_out then raise exception 'Quantity owned cannot be less than quantity currently checked out'; end if;
  perform set_config('shopcore.audit_source', 'save_tool_assembly', true);
  insert into public.tool_assemblies(id, organization_id, assembly_number, description, quantity_owned, notes)
  values (v_id, p_organization_id, btrim(p_assembly_number), btrim(p_description), p_quantity_owned, coalesce(p_notes, ''))
  on conflict (id) do update set assembly_number = excluded.assembly_number,
    description = excluded.description, quantity_owned = excluded.quantity_owned, notes = excluded.notes;
  return v_id;
end;
$$;

create or replace function public.set_tool_assembly_archived(p_tool_assembly_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.tool_assemblies where id = p_tool_assembly_id for update;
  if not found or not (select private.is_manufacturer(v_org)) then
    raise exception using errcode = 'P0001', message = 'Tool assembly not found or access denied';
  end if;
  perform set_config('shopcore.audit_source', 'set_tool_assembly_archived', true);
  update public.tool_assemblies
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
  where id = p_tool_assembly_id;
end;
$$;

create or replace function public.record_tool_checkout(
  p_tool_assembly_id uuid, p_transaction_type text, p_quantity integer,
  p_note text, p_request_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tool public.tool_assemblies%rowtype; v_checked_out integer; v_id uuid;
  v_actor_name text; v_hash text; v_existing_hash text;
begin
  select * into v_tool from public.tool_assemblies where id = p_tool_assembly_id for update;
  if not found or not (select private.is_manufacturer(v_tool.organization_id)) then
    raise exception using errcode = 'P0001', message = 'Tool assembly not found or access denied';
  end if;
  if p_transaction_type not in ('CHECK_OUT', 'CHECK_IN') then raise exception 'Transaction type must be CHECK_OUT or CHECK_IN'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_request_id is null then raise exception 'A request id is required'; end if;
  v_hash := md5(p_tool_assembly_id::text || p_transaction_type || p_quantity::text || coalesce(p_note, ''));
  select id, request_hash into v_id, v_existing_hash
  from public.tool_checkout_transactions
  where organization_id = v_tool.organization_id and request_id = p_request_id;
  if found then
    if v_existing_hash <> v_hash then raise exception 'Checkout request id was already used for a different transaction'; end if;
    return v_id;
  end if;
  select coalesce(sum(case when transaction_type = 'CHECK_OUT' then quantity else -quantity end), 0)::integer
    into v_checked_out from public.tool_checkout_transactions where tool_assembly_id = p_tool_assembly_id;
  if p_transaction_type = 'CHECK_OUT' and p_quantity > v_tool.quantity_owned - v_checked_out then
    raise exception 'Cannot check out more than the available checked-in quantity';
  end if;
  if p_transaction_type = 'CHECK_IN' and p_quantity > v_checked_out then
    raise exception 'Cannot check in more than the checked-out quantity';
  end if;
  select display_name into v_actor_name from public.profiles where id = auth.uid() and organization_id = v_tool.organization_id;
  if v_actor_name is null then raise exception using errcode = 'P0001', message = 'Shop user profile not found or access denied'; end if;
  perform set_config('shopcore.audit_source', 'record_tool_checkout', true);
  insert into public.tool_checkout_transactions(
    organization_id, tool_assembly_id, transaction_type, quantity, note,
    actor_id, actor_display_name, request_id, request_hash
  ) values (
    v_tool.organization_id, p_tool_assembly_id, p_transaction_type, p_quantity,
    coalesce(p_note, ''), auth.uid(), v_actor_name, p_request_id, v_hash
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.save_routing_operation_tools(p_routing_operation_id uuid, p_tools jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_tool jsonb; v_index integer := 0;
begin
  select template.organization_id into v_org
  from public.routing_template_steps operation
  join public.routing_templates template on template.id = operation.routing_template_id
  where operation.id = p_routing_operation_id;
  if not found or not (select private.is_manufacturer(v_org)) then
    raise exception using errcode = 'P0001', message = 'Routing operation not found or access denied';
  end if;
  if coalesce(jsonb_typeof(p_tools), 'null') <> 'array' or jsonb_array_length(p_tools) > 50 then
    raise exception 'Tooling must contain no more than 50 rows';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tools) submitted
    where not exists (
      select 1 from public.tool_assemblies assembly
      where assembly.id = (submitted ->> 'tool_assembly_id')::uuid
        and assembly.organization_id = v_org and assembly.archived_at is null
    )
  ) then raise exception 'Archived or inaccessible tooling cannot be assigned'; end if;
  perform set_config('shopcore.audit_source', 'save_routing_operation_tools', true);
  delete from public.routing_operation_tools where routing_operation_id = p_routing_operation_id;
  for v_tool in select value from jsonb_array_elements(p_tools) loop
    v_index := v_index + 1;
    insert into public.routing_operation_tools(
      organization_id, routing_operation_id, tool_assembly_id, tool_number, notes, sequence_number
    ) values (
      v_org, p_routing_operation_id, (v_tool ->> 'tool_assembly_id')::uuid,
      upper(btrim(v_tool ->> 'tool_number')), coalesce(v_tool ->> 'notes', ''), v_index * 10
    );
  end loop;
end;
$$;

create or replace function public.save_work_order_operation_tools(p_work_order_operation_id uuid, p_tools jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_archived timestamptz; v_tool jsonb; v_index integer := 0;
begin
  select work_order.organization_id, work_order.archived_at into v_org, v_archived
  from public.routing_steps operation
  join public.work_orders work_order on work_order.id = operation.work_order_id
  where operation.id = p_work_order_operation_id;
  if not found or not (select private.is_manufacturer(v_org)) then
    raise exception using errcode = 'P0001', message = 'Work-order operation not found or access denied';
  end if;
  if v_archived is not null then raise exception 'Restore the work order before changing tooling'; end if;
  if coalesce(jsonb_typeof(p_tools), 'null') <> 'array' or jsonb_array_length(p_tools) > 50 then
    raise exception 'Tooling must contain no more than 50 rows';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tools) submitted
    where not exists (
      select 1 from public.tool_assemblies assembly
      where assembly.id = (submitted ->> 'tool_assembly_id')::uuid
        and assembly.organization_id = v_org
        and (assembly.archived_at is null or exists (
          select 1 from public.work_order_operation_tools existing
          where existing.work_order_operation_id = p_work_order_operation_id
            and existing.tool_assembly_id = assembly.id
        ))
    )
  ) then raise exception 'Archived or inaccessible tooling cannot be newly assigned'; end if;
  perform set_config('shopcore.audit_source', 'save_work_order_operation_tools', true);
  delete from public.work_order_operation_tools where work_order_operation_id = p_work_order_operation_id;
  for v_tool in select value from jsonb_array_elements(p_tools) loop
    v_index := v_index + 1;
    insert into public.work_order_operation_tools(
      organization_id, work_order_operation_id, tool_assembly_id, tool_number,
      notes, sequence_number, source_routing_operation_tool_id
    ) values (
      v_org, p_work_order_operation_id, (v_tool ->> 'tool_assembly_id')::uuid,
      upper(btrim(v_tool ->> 'tool_number')), coalesce(v_tool ->> 'notes', ''), v_index * 10,
      nullif(v_tool ->> 'source_routing_operation_tool_id', '')::uuid
    );
  end loop;
end;
$$;

revoke all on function public.save_tool_assembly(uuid, uuid, text, text, integer, text),
  public.set_tool_assembly_archived(uuid, boolean),
  public.record_tool_checkout(uuid, text, integer, text, uuid),
  public.save_routing_operation_tools(uuid, jsonb),
  public.save_work_order_operation_tools(uuid, jsonb)
from public, anon;
grant execute on function public.save_tool_assembly(uuid, uuid, text, text, integer, text),
  public.set_tool_assembly_archived(uuid, boolean),
  public.record_tool_checkout(uuid, text, integer, text, uuid),
  public.save_routing_operation_tools(uuid, jsonb),
  public.save_work_order_operation_tools(uuid, jsonb)
to authenticated;

comment on table public.tool_assemblies is
  'Complete usable tool assemblies only; internal holders, inserts, collets, and cutters remain out of scope.';
comment on table public.tool_checkout_transactions is
  'Append-only physical crib check-in/check-out facts; not reservations and not tied to work orders.';
comment on table public.routing_operation_tools is
  'Default future tooling for one routing-template operation.';
comment on table public.work_order_operation_tools is
  'Independent actual tooling requirement for one released Work Order operation.';

-- Extend routing-template saves so tooling is maintained in the same atomic
-- definition write. Work Orders retain independent copied rows.
create or replace function private.save_routing_template(
  p_template_id uuid, p_organization_id uuid, p_template_name text, p_steps jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_existing_organization_id uuid; v_template_exists boolean; v_template_name text := btrim(p_template_name);
  v_step jsonb; v_tool jsonb; v_step_id uuid; v_index integer := 0; v_tool_index integer;
begin
  if p_template_id is null then raise exception 'A template id is required'; end if;
  if not (select private.is_manufacturer(p_organization_id)) then raise exception using errcode = 'P0001', message = 'Organization not found or access denied'; end if;
  if length(v_template_name) not between 1 and 120 then raise exception 'Template name must be between 1 and 120 characters'; end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) not between 1 and 50 then raise exception 'A routing template requires between 1 and 50 steps'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_steps) step, jsonb_array_elements(coalesce(step -> 'tooling', '[]'::jsonb)) tool
    where not exists (
      select 1 from public.tool_assemblies assembly
      where assembly.id = (tool ->> 'tool_assembly_id')::uuid
        and assembly.organization_id = p_organization_id and assembly.archived_at is null
    )
  ) then raise exception 'Archived or inaccessible tooling cannot be assigned to routing defaults'; end if;
  select organization_id into v_existing_organization_id from public.routing_templates where id = p_template_id for update;
  v_template_exists := found;
  if v_template_exists and v_existing_organization_id <> p_organization_id then raise exception using errcode = 'P0001', message = 'Routing template not found or access denied'; end if;
  perform set_config('shopcore.audit_source', 'save_routing_template', true);
  if v_template_exists then
    update public.routing_templates set template_name = v_template_name where id = p_template_id;
    delete from public.routing_template_steps where routing_template_id = p_template_id;
  else insert into public.routing_templates(id, organization_id, template_name) values (p_template_id, p_organization_id, v_template_name);
  end if;
  for v_step in select value from jsonb_array_elements(p_steps) loop
    v_index := v_index + 1;
    if jsonb_typeof(v_step) <> 'object'
      or length(btrim(coalesce(v_step ->> 'routing_step_name', ''))) not between 1 and 120
      or length(btrim(coalesce(v_step ->> 'customer_stage_name', ''))) not between 1 and 120
      then raise exception 'Every routing step requires an internal step and customer stage of 1 to 120 characters';
    end if;
    insert into public.routing_template_steps(
      routing_template_id, sequence_number, routing_step_name, customer_stage_name, work_instructions
    ) values (
      p_template_id, v_index * 10, btrim(v_step ->> 'routing_step_name'),
      btrim(v_step ->> 'customer_stage_name'), coalesce(v_step ->> 'work_instructions', '')
    ) returning id into v_step_id;
    v_tool_index := 0;
    for v_tool in select value from jsonb_array_elements(coalesce(v_step -> 'tooling', '[]'::jsonb)) loop
      v_tool_index := v_tool_index + 1;
      insert into public.routing_operation_tools(
        organization_id, routing_operation_id, tool_assembly_id, tool_number, notes, sequence_number
      ) values (
        p_organization_id, v_step_id, (v_tool ->> 'tool_assembly_id')::uuid,
        upper(btrim(v_tool ->> 'tool_number')), coalesce(v_tool ->> 'notes', ''), v_tool_index * 10
      );
    end loop;
  end loop;
  return p_template_id;
end;
$$;

-- Extend atomic Work Order release so routing defaults are copied into actual
-- operation tooling in the same transaction. Each routing payload row may
-- carry a `tooling` array; later template changes cannot rewrite these rows.
create or replace function private.create_work_order(p_work_order jsonb, p_routing jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_work_order_id uuid; v_step jsonb; v_tool jsonb; v_step_id uuid; v_first_step_id uuid;
  v_tool_index integer; v_organization_id uuid := (p_work_order ->> 'organization_id')::uuid;
  v_request_id uuid := coalesce(nullif(p_work_order ->> 'request_id', '')::uuid, gen_random_uuid());
  v_request_hash text := md5((p_work_order - 'request_id')::text || p_routing::text); v_existing_hash text;
begin
  if not (select private.is_manufacturer(v_organization_id)) then raise exception using errcode = 'P0001', message = 'Organization not found or access denied'; end if;
  if jsonb_typeof(p_routing) <> 'array' or jsonb_array_length(p_routing) = 0 then raise exception 'At least one routing step is required'; end if;
  if not exists (
    select 1 from public.sales_order_line_items line_item
    join public.sales_orders sales_order on sales_order.id = line_item.sales_order_id
    where line_item.id = (p_work_order ->> 'sales_order_line_item_id')::uuid
      and sales_order.id = (p_work_order ->> 'sales_order_id')::uuid
      and sales_order.organization_id = v_organization_id and sales_order.archived_at is null
      and sales_order.invoiced_at is null and line_item.archived_at is null and line_item.manufactured_item
  ) then raise exception 'Work orders must be created from an active manufactured sales-order line'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_routing) step, jsonb_array_elements(coalesce(step -> 'tooling', '[]'::jsonb)) tool
    where not exists (
      select 1 from public.tool_assemblies assembly
      where assembly.id = (tool ->> 'tool_assembly_id')::uuid
        and assembly.organization_id = v_organization_id and assembly.archived_at is null
    )
  ) then raise exception 'Archived or inaccessible tooling cannot be copied to the Work Order'; end if;
  perform pg_advisory_xact_lock(hashtextextended('work_order_request:' || v_request_id::text, 0));
  select id, creation_request_hash into v_work_order_id, v_existing_hash
  from public.work_orders where organization_id = v_organization_id and creation_request_id = v_request_id;
  if found then
    if v_existing_hash is distinct from v_request_hash then raise exception using errcode = '22023', message = 'Work-order request id was already used for a different work order'; end if;
    return v_work_order_id;
  end if;
  perform set_config('shopcore.audit_source', 'create_work_order', true);
  insert into public.work_orders(
    organization_id, work_order_name, sales_order_id, sales_order_line_item_id,
    part_number, quantity_ordered, due_date, notes, creation_request_id, creation_request_hash
  ) values (
    v_organization_id, coalesce(nullif(btrim(p_work_order ->> 'work_order_name'), ''), nullif(btrim(p_work_order ->> 'work_order_number'), '')),
    (p_work_order ->> 'sales_order_id')::uuid, (p_work_order ->> 'sales_order_line_item_id')::uuid,
    p_work_order ->> 'part_number', (p_work_order ->> 'quantity_ordered')::integer,
    (p_work_order ->> 'due_date')::date, coalesce(p_work_order ->> 'notes', ''), v_request_id, v_request_hash
  ) returning id into v_work_order_id;
  for v_step in select value from jsonb_array_elements(p_routing) order by (value ->> 'sequence_number')::integer loop
    insert into public.routing_steps(
      work_order_id, sequence_number, routing_step_name, customer_stage_name, work_instructions
    ) values (
      v_work_order_id, (v_step ->> 'sequence_number')::integer, v_step ->> 'routing_step_name',
      coalesce(v_step ->> 'customer_stage_name', 'In production'), coalesce(v_step ->> 'work_instructions', '')
    ) returning id into v_step_id;
    if v_first_step_id is null then v_first_step_id := v_step_id; end if;
    v_tool_index := 0;
    for v_tool in select value from jsonb_array_elements(coalesce(v_step -> 'tooling', '[]'::jsonb)) loop
      v_tool_index := v_tool_index + 1;
      insert into public.work_order_operation_tools(
        organization_id, work_order_operation_id, tool_assembly_id, tool_number,
        notes, sequence_number, source_routing_operation_tool_id
      ) values (
        v_organization_id, v_step_id, (v_tool ->> 'tool_assembly_id')::uuid,
        upper(btrim(v_tool ->> 'tool_number')), coalesce(v_tool ->> 'notes', ''), v_tool_index * 10,
        nullif(v_tool ->> 'source_routing_operation_tool_id', '')::uuid
      );
    end loop;
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

create view public.tool_assembly_status with (security_invoker = true) as
with checked_out as (
  select transaction.tool_assembly_id,
    coalesce(sum(case when transaction.transaction_type = 'CHECK_OUT'
      then transaction.quantity else -transaction.quantity end), 0)::integer as quantity_checked_out
  from public.tool_checkout_transactions transaction
  group by transaction.tool_assembly_id
), open_work_order_ids as (
  select work_order.organization_id, array_agg(work_order.id) as ids
  from public.work_orders work_order
  where work_order.archived_at is null and work_order.completion_date is null
  group by work_order.organization_id
), operation_metrics as (
  select requested.organization_id, metrics.*
  from open_work_order_ids requested
  cross join lateral public.work_order_step_metrics(requested.ids) metrics
), requirements as (
  select assignment.tool_assembly_id,
    count(*) filter (where metrics.started_at is not null and metrics.completed_at is null)::integer as quantity_in_use,
    count(*) filter (where metrics.started_at is null and metrics.completed_at is null)::integer as future_requirements
  from public.work_order_operation_tools assignment
  join operation_metrics metrics on metrics.step_id = assignment.work_order_operation_id
  group by assignment.tool_assembly_id
)
select assembly.id as tool_assembly_id, assembly.organization_id,
  coalesce(checked_out.quantity_checked_out, 0)::integer as quantity_checked_out,
  coalesce(requirements.quantity_in_use, 0)::integer as quantity_in_use,
  coalesce(requirements.future_requirements, 0)::integer as future_requirements,
  coalesce(requirements.quantity_in_use, 0) > assembly.quantity_owned as usage_warning
from public.tool_assemblies assembly
left join checked_out on checked_out.tool_assembly_id = assembly.id
left join requirements on requirements.tool_assembly_id = assembly.id;

revoke all on public.tool_assembly_status from public, anon, authenticated;
grant select on public.tool_assembly_status to authenticated;
comment on view public.tool_assembly_status is
  'Derived physical checkout, active operation usage, future requirements, and over-capacity warning for complete tool assemblies.';
