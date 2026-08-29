create or replace function public.dashboard_production_complete_open_orders()
returns table (
  sales_order_id uuid,
  sales_order_name text,
  customer_name text,
  customer_po_number text,
  order_due_date date,
  production_completed_at date,
  shipped_at timestamptz,
  invoiced_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with actor as (
    select profile.organization_id
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.role = 'manufacturer'::public.profile_role
  )
  select
    sales_order.id,
    sales_order.sales_order_name,
    sales_order.customer_name,
    sales_order.customer_po_number,
    sales_order.order_due_date,
    max(work_order.completion_date) as production_completed_at,
    sales_order.shipped_at,
    sales_order.invoiced_at
  from public.sales_orders as sales_order
  join actor on actor.organization_id = sales_order.organization_id
  join public.work_orders as work_order
    on work_order.sales_order_id = sales_order.id
    and work_order.organization_id = sales_order.organization_id
    and work_order.archived_at is null
  where sales_order.archived_at is null
    and (sales_order.shipped_at is null or sales_order.invoiced_at is null)
  group by sales_order.id
  having bool_and(work_order.completion_date is not null)
  order by max(work_order.completion_date), sales_order.order_due_date, sales_order.sales_order_name
  limit 50;
$$;

comment on function public.dashboard_production_complete_open_orders() is
  'Manufacturer-only, organization-scoped list of up to 50 active sales orders whose active work orders are complete but shipment or invoicing confirmation remains open.';

revoke all on function public.dashboard_production_complete_open_orders() from public, anon;
grant execute on function public.dashboard_production_complete_open_orders() to authenticated;
