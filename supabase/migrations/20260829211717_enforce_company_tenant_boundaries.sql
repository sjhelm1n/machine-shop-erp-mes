-- Make company ownership explicit on independently addressable child records and
-- make cross-company relationships structurally impossible.

alter table public.sales_order_line_items add column organization_id uuid;
alter table public.routing_steps add column organization_id uuid;
alter table public.routing_template_steps add column organization_id uuid;
alter table public.customer_stage_mappings add column organization_id uuid;

-- These are ownership backfills, not business mutations. Existing lifecycle
-- and audit triggers would otherwise reject or record historical rows.
alter table public.sales_order_line_items disable trigger user;
alter table public.routing_steps disable trigger user;
alter table public.routing_template_steps disable trigger user;
alter table public.customer_stage_mappings disable trigger user;

update public.sales_order_line_items as line_item
set organization_id = sales_order.organization_id
from public.sales_orders as sales_order
where sales_order.id = line_item.sales_order_id;

update public.routing_steps as routing_step
set organization_id = work_order.organization_id
from public.work_orders as work_order
where work_order.id = routing_step.work_order_id;

update public.routing_template_steps as routing_step
set organization_id = routing_template.organization_id
from public.routing_templates as routing_template
where routing_template.id = routing_step.routing_template_id;

update public.customer_stage_mappings as stage_mapping
set organization_id = work_order.organization_id
from public.work_orders as work_order
where work_order.id = stage_mapping.work_order_id;

alter table public.sales_order_line_items enable trigger user;
alter table public.routing_steps enable trigger user;
alter table public.routing_template_steps enable trigger user;
alter table public.customer_stage_mappings enable trigger user;

create function private.set_sales_order_line_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select sales_order.organization_id
    into v_organization_id
  from public.sales_orders as sales_order
  where sales_order.id = new.sales_order_id;

  if not found then
    raise exception using errcode = '23503', message = 'Sales order not found';
  end if;
  if new.organization_id is not null and new.organization_id <> v_organization_id then
    raise exception using errcode = '23514', message = 'Sales-order line organization must match its sales order';
  end if;

  new.organization_id := v_organization_id;
  return new;
end;
$$;

create function private.set_routing_step_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select work_order.organization_id
    into v_organization_id
  from public.work_orders as work_order
  where work_order.id = new.work_order_id;

  if not found then
    raise exception using errcode = '23503', message = 'Work order not found';
  end if;
  if new.organization_id is not null and new.organization_id <> v_organization_id then
    raise exception using errcode = '23514', message = 'Routing-step organization must match its work order';
  end if;

  new.organization_id := v_organization_id;
  return new;
end;
$$;

create function private.set_routing_template_step_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select routing_template.organization_id
    into v_organization_id
  from public.routing_templates as routing_template
  where routing_template.id = new.routing_template_id;

  if not found then
    raise exception using errcode = '23503', message = 'Routing template not found';
  end if;
  if new.organization_id is not null and new.organization_id <> v_organization_id then
    raise exception using errcode = '23514', message = 'Routing-template step organization must match its template';
  end if;

  new.organization_id := v_organization_id;
  return new;
end;
$$;

create function private.set_customer_stage_mapping_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select work_order.organization_id
    into v_organization_id
  from public.work_orders as work_order
  join public.routing_steps as routing_step
    on routing_step.id = new.routing_step_id
   and routing_step.work_order_id = work_order.id
   and routing_step.organization_id = work_order.organization_id
  where work_order.id = new.work_order_id;

  if not found then
    raise exception using errcode = '23503', message = 'Customer stage mapping must reference a routing step from its work order';
  end if;
  if new.organization_id is not null and new.organization_id <> v_organization_id then
    raise exception using errcode = '23514', message = 'Customer stage mapping organization must match its work order';
  end if;

  new.organization_id := v_organization_id;
  return new;
end;
$$;

revoke all on function private.set_sales_order_line_organization() from public, anon, authenticated;
revoke all on function private.set_routing_step_organization() from public, anon, authenticated;
revoke all on function private.set_routing_template_step_organization() from public, anon, authenticated;
revoke all on function private.set_customer_stage_mapping_organization() from public, anon, authenticated;

create trigger sales_order_line_items_set_organization
before insert or update on public.sales_order_line_items
for each row execute function private.set_sales_order_line_organization();

create trigger routing_steps_set_organization
before insert or update on public.routing_steps
for each row execute function private.set_routing_step_organization();

create trigger routing_template_steps_set_organization
before insert or update on public.routing_template_steps
for each row execute function private.set_routing_template_step_organization();

create trigger customer_stage_mappings_set_organization
before insert or update on public.customer_stage_mappings
for each row execute function private.set_customer_stage_mapping_organization();

alter table public.sales_order_line_items alter column organization_id set not null;
alter table public.routing_steps alter column organization_id set not null;
alter table public.routing_template_steps alter column organization_id set not null;
alter table public.customer_stage_mappings alter column organization_id set not null;

alter table public.sales_order_line_items
  add constraint sales_order_line_items_id_order_organization_key
    unique (id, sales_order_id, organization_id);
alter table public.routing_steps
  add constraint routing_steps_id_organization_key
    unique (id, organization_id),
  add constraint routing_steps_id_work_order_organization_key
    unique (id, work_order_id, organization_id);
alter table public.routing_template_steps
  add constraint routing_template_steps_id_organization_key
    unique (id, organization_id);
alter table public.routing_operation_tools
  add constraint routing_operation_tools_id_organization_key
    unique (id, organization_id);
alter table public.production_events
  add constraint production_events_id_organization_key
    unique (id, organization_id);

alter table public.sales_order_line_items
  drop constraint sales_order_line_items_sales_order_id_fkey,
  add constraint sales_order_line_items_sales_order_organization_fkey
    foreign key (sales_order_id, organization_id)
    references public.sales_orders(id, organization_id)
    on delete cascade;

alter table public.work_orders
  drop constraint work_orders_sales_order_line_item_id_fkey,
  drop constraint work_orders_sales_order_line_item_id_sales_order_id_fkey,
  add constraint work_orders_line_order_organization_fkey
    foreign key (sales_order_line_item_id, sales_order_id, organization_id)
    references public.sales_order_line_items(id, sales_order_id, organization_id)
    on delete restrict;

alter table public.routing_steps
  drop constraint routing_steps_work_order_id_fkey,
  add constraint routing_steps_work_order_organization_fkey
    foreign key (work_order_id, organization_id)
    references public.work_orders(id, organization_id)
    on delete cascade;

alter table public.customer_stage_mappings
  drop constraint customer_stage_mappings_work_order_id_fkey,
  drop constraint customer_stage_mappings_routing_step_id_fkey,
  add constraint customer_stage_mappings_work_order_organization_fkey
    foreign key (work_order_id, organization_id)
    references public.work_orders(id, organization_id)
    on delete cascade,
  add constraint customer_stage_mappings_step_work_order_organization_fkey
    foreign key (routing_step_id, work_order_id, organization_id)
    references public.routing_steps(id, work_order_id, organization_id)
    on delete cascade;

alter table public.routing_template_steps
  drop constraint routing_template_steps_routing_template_id_fkey,
  add constraint routing_template_steps_template_organization_fkey
    foreign key (routing_template_id, organization_id)
    references public.routing_templates(id, organization_id)
    on delete cascade;

alter table public.routing_operation_tools
  drop constraint routing_operation_tools_routing_operation_id_fkey,
  add constraint routing_operation_tools_operation_organization_fkey
    foreign key (routing_operation_id, organization_id)
    references public.routing_template_steps(id, organization_id)
    on delete cascade;

alter table public.work_order_operation_tools
  drop constraint work_order_operation_tools_work_order_operation_id_fkey,
  drop constraint work_order_operation_tools_source_routing_operation_tool_i_fkey,
  add constraint work_order_operation_tools_operation_organization_fkey
    foreign key (work_order_operation_id, organization_id)
    references public.routing_steps(id, organization_id)
    on delete restrict,
  add constraint work_order_operation_tools_source_organization_fkey
    foreign key (source_routing_operation_tool_id, organization_id)
    references public.routing_operation_tools(id, organization_id)
    on delete set null (source_routing_operation_tool_id);

alter table public.production_events
  drop constraint production_events_routing_step_id_fkey,
  drop constraint production_events_from_routing_step_id_fkey,
  drop constraint production_events_to_routing_step_id_fkey,
  drop constraint production_events_reversed_event_id_fkey,
  add constraint production_events_routing_step_work_order_organization_fkey
    foreign key (routing_step_id, work_order_id, organization_id)
    references public.routing_steps(id, work_order_id, organization_id)
    on delete restrict,
  add constraint production_events_from_step_work_order_organization_fkey
    foreign key (from_routing_step_id, work_order_id, organization_id)
    references public.routing_steps(id, work_order_id, organization_id)
    on delete restrict,
  add constraint production_events_to_step_work_order_organization_fkey
    foreign key (to_routing_step_id, work_order_id, organization_id)
    references public.routing_steps(id, work_order_id, organization_id)
    on delete restrict,
  add constraint production_events_reversed_event_organization_fkey
    foreign key (reversed_event_id, organization_id)
    references public.production_events(id, organization_id)
    on delete restrict;

alter table public.profiles
  drop constraint profiles_customer_id_fkey,
  add constraint profiles_customer_organization_fkey
    foreign key (customer_id, organization_id)
    references public.customers(id, organization_id)
    on delete restrict;

create index sales_order_line_items_sales_order_organization_idx
  on public.sales_order_line_items(sales_order_id, organization_id);
create index routing_steps_work_order_organization_idx
  on public.routing_steps(work_order_id, organization_id);
create index routing_template_steps_template_organization_idx
  on public.routing_template_steps(routing_template_id, organization_id);
create index customer_stage_mappings_work_order_organization_idx
  on public.customer_stage_mappings(work_order_id, organization_id);
create index work_orders_line_order_organization_idx
  on public.work_orders(sales_order_line_item_id, sales_order_id, organization_id);
create index routing_operation_tools_operation_organization_idx
  on public.routing_operation_tools(routing_operation_id, organization_id);
create index work_order_operation_tools_operation_organization_idx
  on public.work_order_operation_tools(work_order_operation_id, organization_id);
create index work_order_operation_tools_source_organization_idx
  on public.work_order_operation_tools(source_routing_operation_tool_id, organization_id)
  where source_routing_operation_tool_id is not null;
create index production_events_routing_step_work_order_organization_idx
  on public.production_events(routing_step_id, work_order_id, organization_id);
create index production_events_from_step_work_order_organization_idx
  on public.production_events(from_routing_step_id, work_order_id, organization_id)
  where from_routing_step_id is not null;
create index production_events_to_step_work_order_organization_idx
  on public.production_events(to_routing_step_id, work_order_id, organization_id)
  where to_routing_step_id is not null;
create index production_events_reversed_event_organization_idx
  on public.production_events(reversed_event_id, organization_id)
  where reversed_event_id is not null;

drop policy line_items_select on public.sales_order_line_items;
create policy line_items_select on public.sales_order_line_items
for select to authenticated
using ((select private.is_manufacturer(organization_id)));

drop policy line_items_insert on public.sales_order_line_items;
create policy line_items_insert on public.sales_order_line_items
for insert to authenticated
with check ((select private.is_manufacturer(organization_id)));

drop policy line_items_update on public.sales_order_line_items;
create policy line_items_update on public.sales_order_line_items
for update to authenticated
using ((select private.is_manufacturer(organization_id)))
with check ((select private.is_manufacturer(organization_id)));

drop policy routing_steps_select on public.routing_steps;
create policy routing_steps_select on public.routing_steps
for select to authenticated
using ((select private.is_manufacturer(organization_id)));

drop policy routing_steps_insert on public.routing_steps;
create policy routing_steps_insert on public.routing_steps
for insert to authenticated
with check ((select private.is_manufacturer(organization_id)));

drop policy routing_steps_update on public.routing_steps;
create policy routing_steps_update on public.routing_steps
for update to authenticated
using ((select private.is_manufacturer(organization_id)))
with check ((select private.is_manufacturer(organization_id)));

drop policy routing_template_steps_select on public.routing_template_steps;
create policy routing_template_steps_select on public.routing_template_steps
for select to authenticated
using ((select private.is_manufacturer(organization_id)));

drop policy customer_stage_mappings_select on public.customer_stage_mappings;
create policy customer_stage_mappings_select on public.customer_stage_mappings
for select to authenticated
using ((select private.is_manufacturer(organization_id)));
