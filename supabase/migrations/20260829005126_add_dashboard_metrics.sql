create index if not exists sales_orders_organization_received_idx
  on public.sales_orders(organization_id, date_received);

create index if not exists sales_orders_organization_shipped_idx
  on public.sales_orders(organization_id, shipped_at)
  where shipped_at is not null;

create index if not exists production_events_organization_scrap_created_idx
  on public.production_events(organization_id, created_at)
  where event_type = 'scrap';

create or replace function public.dashboard_metrics(
  p_start_date date default null,
  p_end_date date default null,
  p_bucket text default 'month'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_plant_timezone text;
  v_result jsonb;
begin
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise exception 'Start date must be on or before end date';
  end if;

  if p_bucket not in ('day', 'week', 'month') then
    raise exception 'Dashboard bucket must be day, week, or month';
  end if;

  select profile.organization_id, organization.plant_timezone
  into v_organization_id, v_plant_timezone
  from public.profiles as profile
  join public.organizations as organization on organization.id = profile.organization_id
  where profile.id = (select auth.uid())
    and profile.role::text = 'manufacturer';

  if v_organization_id is null then
    raise exception 'Manufacturer access required' using errcode = '42501';
  end if;

  with
  revenue_by_customer as (
    select
      sales_order.customer_id,
      customer.customer_name,
      coalesce(sum(line.line_total), 0)::numeric(14, 2) as revenue
    from public.sales_orders as sales_order
    join public.customers as customer on customer.id = sales_order.customer_id
    join public.sales_order_line_items as line on line.sales_order_id = sales_order.id
    where sales_order.organization_id = v_organization_id
      and line.archived_at is null
      and (p_start_date is null or sales_order.date_received >= p_start_date)
      and (p_end_date is null or sales_order.date_received <= p_end_date)
    group by sales_order.customer_id, customer.customer_name
  ),
  delivery_summary as (
    select
      count(*) filter (
        where (sales_order.shipped_at at time zone v_plant_timezone)::date < sales_order.order_due_date
      )::integer as on_time,
      count(*) filter (
        where (sales_order.shipped_at at time zone v_plant_timezone)::date >= sales_order.order_due_date
      )::integer as late
    from public.sales_orders as sales_order
    where sales_order.organization_id = v_organization_id
      and sales_order.shipped_at is not null
      and (
        p_start_date is null
        or (sales_order.shipped_at at time zone v_plant_timezone)::date >= p_start_date
      )
      and (
        p_end_date is null
        or (sales_order.shipped_at at time zone v_plant_timezone)::date <= p_end_date
      )
  ),
  line_work_order_totals as (
    select
      work_order.sales_order_line_item_id,
      sum(work_order.quantity_ordered)::numeric as total_quantity
    from public.work_orders as work_order
    where work_order.organization_id = v_organization_id
      and work_order.archived_at is null
    group by work_order.sales_order_line_item_id
  ),
  production_revenue_rows as (
    select
      work_order.id as work_order_id,
      work_order.work_order_name,
      work_order.part_number,
      customer.customer_name,
      round(
        line.line_total * work_order.quantity_ordered::numeric
        / nullif(line_work_order_totals.total_quantity, 0),
        2
      ) as revenue
    from public.work_orders as work_order
    join public.sales_orders as sales_order on sales_order.id = work_order.sales_order_id
    join public.customers as customer on customer.id = sales_order.customer_id
    join public.sales_order_line_items as line on line.id = work_order.sales_order_line_item_id
    join line_work_order_totals on line_work_order_totals.sales_order_line_item_id = line.id
    where work_order.organization_id = v_organization_id
      and work_order.archived_at is null
      and work_order.completion_date is null
      and sales_order.archived_at is null
      and line.archived_at is null
      and (p_start_date is null or sales_order.date_received >= p_start_date)
      and (p_end_date is null or sales_order.date_received <= p_end_date)
    order by revenue desc, work_order.work_order_name
    limit 20
  ),
  scrap_rows as (
    select
      date_trunc(p_bucket, production_event.created_at at time zone v_plant_timezone)::date as bucket_date,
      sum(production_event.quantity)::integer as quantity
    from public.production_events as production_event
    where production_event.organization_id = v_organization_id
      and production_event.event_type = 'scrap'
      and not exists (
        select 1
        from public.production_events as reversal
        where reversal.reversed_event_id = production_event.id
      )
      and (
        p_start_date is null
        or (production_event.created_at at time zone v_plant_timezone)::date >= p_start_date
      )
      and (
        p_end_date is null
        or (production_event.created_at at time zone v_plant_timezone)::date <= p_end_date
      )
    group by date_trunc(p_bucket, production_event.created_at at time zone v_plant_timezone)::date
    order by bucket_date
  ),
  work_order_activity as (
    select
      work_order.id as work_order_id,
      work_order.work_order_name,
      work_order.part_number,
      customer.customer_name,
      greatest(work_order.released_at, coalesce(max(production_event.created_at), work_order.released_at)) as last_activity_at
    from public.work_orders as work_order
    join public.sales_orders as sales_order on sales_order.id = work_order.sales_order_id
    join public.customers as customer on customer.id = sales_order.customer_id
    left join public.production_events as production_event on production_event.work_order_id = work_order.id
    where work_order.organization_id = v_organization_id
      and work_order.archived_at is null
      and work_order.completion_date is null
    group by work_order.id, customer.customer_name
  ),
  idle_work_orders as (
    select
      activity.work_order_id,
      activity.work_order_name,
      activity.part_number,
      activity.customer_name,
      activity.last_activity_at,
      floor(extract(epoch from (now() - activity.last_activity_at)) / 3600)::integer as idle_hours
    from work_order_activity as activity
    where activity.last_activity_at < now() - interval '24 hours'
    order by activity.last_activity_at, activity.work_order_name
    limit 50
  ),
  lead_time_rows as (
    select
      work_order.id as work_order_id,
      work_order.work_order_name,
      work_order.part_number,
      customer.customer_name,
      (work_order.created_at at time zone v_plant_timezone)::date as entered_date,
      work_order.completion_date,
      greatest(
        work_order.completion_date - (work_order.created_at at time zone v_plant_timezone)::date,
        0
      )::integer as lead_time_days
    from public.work_orders as work_order
    join public.sales_orders as sales_order on sales_order.id = work_order.sales_order_id
    join public.customers as customer on customer.id = sales_order.customer_id
    where work_order.organization_id = v_organization_id
      and work_order.completion_date is not null
      and (p_start_date is null or work_order.completion_date >= p_start_date)
      and (p_end_date is null or work_order.completion_date <= p_end_date)
    order by work_order.completion_date desc, work_order.work_order_name
    limit 50
  )
  select jsonb_build_object(
    'revenueByCustomer', coalesce((
      select jsonb_agg(jsonb_build_object(
        'customerId', row.customer_id,
        'customerName', row.customer_name,
        'revenue', row.revenue
      ) order by row.revenue desc, row.customer_name)
      from revenue_by_customer as row
    ), '[]'::jsonb),
    'onTimeDelivery', (
      select jsonb_build_object('onTime', summary.on_time, 'late', summary.late)
      from delivery_summary as summary
    ),
    'productionRevenue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'workOrderId', row.work_order_id,
        'workOrderName', row.work_order_name,
        'partNumber', row.part_number,
        'customerName', row.customer_name,
        'revenue', row.revenue
      ) order by row.revenue desc, row.work_order_name)
      from production_revenue_rows as row
    ), '[]'::jsonb),
    'scrapOverTime', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', row.bucket_date,
        'quantity', row.quantity
      ) order by row.bucket_date)
      from scrap_rows as row
    ), '[]'::jsonb),
    'idleWorkOrders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'workOrderId', row.work_order_id,
        'workOrderName', row.work_order_name,
        'partNumber', row.part_number,
        'customerName', row.customer_name,
        'lastActivityAt', row.last_activity_at,
        'idleHours', row.idle_hours
      ) order by row.last_activity_at, row.work_order_name)
      from idle_work_orders as row
    ), '[]'::jsonb),
    'leadTimes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'workOrderId', row.work_order_id,
        'workOrderName', row.work_order_name,
        'partNumber', row.part_number,
        'customerName', row.customer_name,
        'enteredDate', row.entered_date,
        'completionDate', row.completion_date,
        'leadTimeDays', row.lead_time_days
      ) order by row.completion_date desc, row.work_order_name)
      from lead_time_rows as row
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.dashboard_metrics(date, date, text) is
  'Manufacturer-only, organization-scoped dashboard aggregates. Sales revenue uses sales-order received dates; delivery uses plant-local shipment dates; scrap excludes reversed events.';

revoke all on function public.dashboard_metrics(date, date, text) from public, anon;
grant execute on function public.dashboard_metrics(date, date, text) to authenticated;
