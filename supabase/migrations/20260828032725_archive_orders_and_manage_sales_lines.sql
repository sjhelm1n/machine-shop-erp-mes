alter table public.sales_orders
  add column archived_at timestamptz;

alter table public.work_orders
  add column archived_at timestamptz;

comment on column public.sales_orders.archived_at is
  'When a manufacturer archived this sales order from active manufacturer workflows.';
comment on column public.work_orders.archived_at is
  'When a manufacturer archived this work order from active production workflows.';

create index sales_orders_organization_archived_date_idx
  on public.sales_orders(organization_id, archived_at, date_received desc);
create index work_orders_organization_archived_due_idx
  on public.work_orders(organization_id, archived_at, due_date);

create or replace function public.set_sales_order_archived(
  p_sales_order_id uuid,
  p_archived boolean
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_archived_at timestamptz;
begin
  update public.sales_orders
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
  where id = p_sales_order_id
  returning archived_at into v_archived_at;

  if not found then
    raise exception using errcode = 'P0001', message = 'Sales order not found or access denied';
  end if;

  return v_archived_at;
end;
$$;

create or replace function public.set_work_order_archived(
  p_work_order_id uuid,
  p_archived boolean
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_archived_at timestamptz;
begin
  update public.work_orders
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
  where id = p_work_order_id
  returning archived_at into v_archived_at;

  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found or access denied';
  end if;

  return v_archived_at;
end;
$$;

drop trigger if exists sales_order_line_items_prevent_invoiced_insert
  on public.sales_order_line_items;
drop function if exists private.prevent_invoiced_sales_order_line_insert();

create or replace function private.validate_sales_order_line_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sales_order_id uuid;
  v_invoiced_at timestamptz;
  v_archived_at timestamptz;
  v_line_id uuid;
begin
  v_sales_order_id := case when tg_op = 'DELETE' then old.sales_order_id else new.sales_order_id end;
  v_line_id := case when tg_op = 'INSERT' then new.id else old.id end;

  select sales_order.invoiced_at, sales_order.archived_at
    into v_invoiced_at, v_archived_at
  from public.sales_orders as sales_order
  where sales_order.id = v_sales_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Sales order not found or access denied';
  end if;

  if v_archived_at is not null then
    raise exception using errcode = 'P0001', message = 'Restore the sales order before changing line items';
  end if;

  if v_invoiced_at is not null then
    raise exception using errcode = 'P0001', message = 'Line items cannot be changed after the sales order is invoiced';
  end if;

  if tg_op = 'UPDATE' then
    if new.sales_order_id is distinct from old.sales_order_id
      or new.line_number is distinct from old.line_number
      or new.sort_order is distinct from old.sort_order then
      raise exception using errcode = 'P0001', message = 'Line identity and ordering cannot be changed';
    end if;

    if exists (
      select 1 from public.work_orders as work_order
      where work_order.sales_order_line_item_id = old.id
    ) and (
      new.part_number is distinct from old.part_number
      or new.manufactured_item is distinct from old.manufactured_item
    ) then
      raise exception using errcode = 'P0001', message = 'Part number and manufactured status cannot change after a work order is linked';
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if exists (
      select 1 from public.work_orders as work_order
      where work_order.sales_order_line_item_id = old.id
    ) then
      raise exception using errcode = 'P0001', message = 'Delete the linked work orders before deleting this line item';
    end if;

    if (
      select count(*)
      from public.sales_order_line_items as line_item
      where line_item.sales_order_id = old.sales_order_id
    ) <= 1 then
      raise exception using errcode = 'P0001', message = 'A sales order must keep at least one line item';
    end if;

    return old;
  end if;

  return new;
end;
$$;

create trigger sales_order_line_items_mutation_guard
before insert or update or delete on public.sales_order_line_items
for each row execute function private.validate_sales_order_line_mutation();

create or replace function public.update_sales_order_line(
  p_line_id uuid,
  p_line jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.sales_order_line_items
  set
    part_number = nullif(btrim(p_line ->> 'part_number'), ''),
    description = btrim(p_line ->> 'description'),
    manufactured_item = coalesce((p_line ->> 'manufactured_item')::boolean, false),
    pricing_type = p_line ->> 'pricing_type',
    quantity = (p_line ->> 'quantity')::integer,
    unit_price = nullif(p_line ->> 'unit_price', '')::numeric,
    flat_rate_amount = nullif(p_line ->> 'flat_rate_amount', '')::numeric
  where id = p_line_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'Sales order line not found or access denied';
  end if;
end;
$$;

create or replace function public.delete_sales_order_line(
  p_line_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.sales_order_line_items
  where id = p_line_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'Sales order line not found or access denied';
  end if;
end;
$$;

create or replace function private.prevent_archived_work_order_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_archived_at timestamptz;
begin
  select work_order.archived_at
    into v_archived_at
  from public.work_orders as work_order
  where work_order.id = new.work_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found or access denied';
  end if;

  if v_archived_at is not null then
    raise exception using errcode = 'P0001', message = 'Restore the work order before recording production';
  end if;

  return new;
end;
$$;

create trigger production_event_archive_guard
before insert on public.production_events
for each row execute function private.prevent_archived_work_order_event();

create or replace function private.prevent_archived_sales_order_work_order()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_archived_at timestamptz;
begin
  select sales_order.archived_at
    into v_archived_at
  from public.sales_orders as sales_order
  where sales_order.id = new.sales_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Sales order not found or access denied';
  end if;

  if v_archived_at is not null then
    raise exception using errcode = 'P0001', message = 'Restore the sales order before creating work orders';
  end if;

  return new;
end;
$$;

create trigger work_order_sales_order_archive_guard
before insert on public.work_orders
for each row execute function private.prevent_archived_sales_order_work_order();

grant update(archived_at) on public.work_orders to authenticated;
grant delete on public.sales_order_line_items to authenticated;

create policy line_items_delete
on public.sales_order_line_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.sales_orders as sales_order
    where sales_order.id = sales_order_line_items.sales_order_id
      and (select private.is_manufacturer(sales_order.organization_id))
  )
);

revoke all on function public.set_sales_order_archived(uuid, boolean) from public, anon;
revoke all on function public.set_work_order_archived(uuid, boolean) from public, anon;
revoke all on function public.update_sales_order_line(uuid, jsonb) from public, anon;
revoke all on function public.delete_sales_order_line(uuid) from public, anon;
revoke all on function private.validate_sales_order_line_mutation() from public, anon, authenticated;
revoke all on function private.prevent_archived_work_order_event() from public, anon, authenticated;
revoke all on function private.prevent_archived_sales_order_work_order() from public, anon, authenticated;

grant execute on function public.set_sales_order_archived(uuid, boolean) to authenticated;
grant execute on function public.set_work_order_archived(uuid, boolean) to authenticated;
grant execute on function public.update_sales_order_line(uuid, jsonb) to authenticated;
grant execute on function public.delete_sales_order_line(uuid) to authenticated;
