alter table public.sales_order_line_items
  add column archived_at timestamptz;

comment on column public.sales_order_line_items.archived_at is
  'When a manufacturer archived this pricing line without deleting its history.';

create index sales_order_line_items_sales_order_archived_sort_idx
  on public.sales_order_line_items(sales_order_id, archived_at, sort_order);

drop function if exists public.delete_sales_order_line(uuid);
drop policy if exists line_items_delete on public.sales_order_line_items;
revoke delete on public.sales_order_line_items from authenticated;

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
begin
  v_sales_order_id := case when tg_op = 'DELETE' then old.sales_order_id else new.sales_order_id end;

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

  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'Sales order line items must be archived, not deleted';
  end if;

  if tg_op = 'INSERT' then
    if new.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'New sales order lines cannot start archived';
    end if;
    return new;
  end if;

  if new.sales_order_id is distinct from old.sales_order_id
    or new.line_number is distinct from old.line_number
    or new.sort_order is distinct from old.sort_order then
    raise exception using errcode = 'P0001', message = 'Line identity and ordering cannot be changed';
  end if;

  if new.archived_at is distinct from old.archived_at then
    if new.part_number is distinct from old.part_number
      or new.description is distinct from old.description
      or new.manufactured_item is distinct from old.manufactured_item
      or new.pricing_type is distinct from old.pricing_type
      or new.quantity is distinct from old.quantity
      or new.unit_price is distinct from old.unit_price
      or new.flat_rate_amount is distinct from old.flat_rate_amount then
      raise exception using errcode = 'P0001', message = 'Archive or restore the line separately from editing it';
    end if;

    if new.archived_at is not null then
      if exists (
        select 1 from public.work_orders as work_order
        where work_order.sales_order_line_item_id = old.id
      ) then
        raise exception using errcode = 'P0001', message = 'Archive is unavailable while a work order is linked to this line item';
      end if;

      if (
        select count(*)
        from public.sales_order_line_items as line_item
        where line_item.sales_order_id = old.sales_order_id
          and line_item.archived_at is null
      ) <= 1 then
        raise exception using errcode = 'P0001', message = 'A sales order must keep at least one active line item';
      end if;
    end if;

    return new;
  end if;

  if old.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'Restore the line item before editing it';
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
end;
$$;

create or replace function public.set_sales_order_line_archived(
  p_line_id uuid,
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
  update public.sales_order_line_items
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
  where id = p_line_id
  returning archived_at into v_archived_at;

  if not found then
    raise exception using errcode = 'P0001', message = 'Sales order line not found or access denied';
  end if;

  return v_archived_at;
end;
$$;

create or replace function private.prevent_archived_sales_order_work_order()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sales_order_archived_at timestamptz;
  v_line_archived_at timestamptz;
begin
  select sales_order.archived_at, line_item.archived_at
    into v_sales_order_archived_at, v_line_archived_at
  from public.sales_orders as sales_order
  join public.sales_order_line_items as line_item
    on line_item.id = new.sales_order_line_item_id
   and line_item.sales_order_id = sales_order.id
  where sales_order.id = new.sales_order_id
  for update of sales_order, line_item;

  if not found then
    raise exception using errcode = 'P0001', message = 'Sales order line not found or access denied';
  end if;

  if v_sales_order_archived_at is not null then
    raise exception using errcode = 'P0001', message = 'Restore the sales order before creating work orders';
  end if;

  if v_line_archived_at is not null then
    raise exception using errcode = 'P0001', message = 'Restore the sales order line before creating work orders';
  end if;

  return new;
end;
$$;

create or replace function private.customer_portal_sales_order_lines()
returns table (
  id uuid,
  sales_order_id uuid,
  line_number integer,
  part_number text,
  description text,
  manufactured_item boolean,
  quantity integer,
  sort_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select li.id, li.sales_order_id, li.line_number, li.part_number, li.description,
    li.manufactured_item, li.quantity, li.sort_order
  from public.sales_order_line_items li
  join public.sales_orders so on so.id = li.sales_order_id
  join public.profiles p
    on p.id = (select auth.uid())
    and p.role = 'customer'
    and p.organization_id = so.organization_id
    and p.customer_id = so.customer_id
  where li.archived_at is null
  order by li.sort_order, li.line_number;
$$;

revoke all on function public.set_sales_order_line_archived(uuid, boolean) from public, anon;
grant execute on function public.set_sales_order_line_archived(uuid, boolean) to authenticated;
