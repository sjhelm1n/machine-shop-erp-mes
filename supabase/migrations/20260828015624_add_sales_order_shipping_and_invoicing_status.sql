alter table public.sales_orders
  add column shipped_at timestamptz,
  add column invoiced_at timestamptz;

comment on column public.sales_orders.shipped_at is
  'When a manufacturer marked the externally handled shipment complete.';
comment on column public.sales_orders.invoiced_at is
  'When a manufacturer confirmed the customer was invoiced in the external accounting system.';

drop function if exists public.customer_portal_sales_orders();
drop function if exists private.customer_portal_sales_orders();

create function private.customer_portal_sales_orders()
returns table (
  id uuid,
  organization_id uuid,
  sales_order_name text,
  customer_id uuid,
  customer_name text,
  customer_po_number text,
  date_received date,
  order_due_date date,
  shipped_at timestamptz,
  invoiced_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    so.id,
    so.organization_id,
    so.sales_order_name,
    so.customer_id,
    so.customer_name,
    so.customer_po_number,
    so.date_received,
    so.order_due_date,
    so.shipped_at,
    so.invoiced_at
  from public.sales_orders so
  join public.profiles p
    on p.id = (select auth.uid())
    and p.role = 'customer'
    and p.organization_id = so.organization_id
    and p.customer_id = so.customer_id
  order by so.date_received desc;
$$;

create function public.customer_portal_sales_orders()
returns table (
  id uuid,
  organization_id uuid,
  sales_order_name text,
  customer_id uuid,
  customer_name text,
  customer_po_number text,
  date_received date,
  order_due_date date,
  shipped_at timestamptz,
  invoiced_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.customer_portal_sales_orders();
$$;

revoke all on function private.customer_portal_sales_orders() from public, anon;
revoke all on function public.customer_portal_sales_orders() from public, anon;
grant execute on function private.customer_portal_sales_orders() to authenticated;
grant execute on function public.customer_portal_sales_orders() to authenticated, service_role;
