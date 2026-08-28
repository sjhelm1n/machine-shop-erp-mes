create or replace function private.prevent_invoiced_sales_order_line_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoiced_at timestamptz;
begin
  select sales_order.invoiced_at
    into v_invoiced_at
  from public.sales_orders as sales_order
  where sales_order.id = new.sales_order_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Sales order not found or access denied';
  end if;

  if v_invoiced_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'Line items cannot be added after the sales order is invoiced';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_invoiced_sales_order_line_insert() from public;
revoke all on function private.prevent_invoiced_sales_order_line_insert() from anon;
revoke all on function private.prevent_invoiced_sales_order_line_insert() from authenticated;

drop trigger if exists sales_order_line_items_prevent_invoiced_insert
  on public.sales_order_line_items;

create trigger sales_order_line_items_prevent_invoiced_insert
before insert on public.sales_order_line_items
for each row execute function private.prevent_invoiced_sales_order_line_insert();

comment on function private.prevent_invoiced_sales_order_line_insert() is
  'Enforces the no-new-lines-after-invoicing invariant for every sales_order_line_items insert path.';
