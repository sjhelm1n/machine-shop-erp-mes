create or replace function private.customer_portal_work_orders()
returns table (
  id uuid,
  organization_id uuid,
  sales_order_id uuid,
  sales_order_line_item_id uuid,
  part_number text,
  quantity_ordered integer,
  due_date date,
  completion_date date,
  customer_progress_percent integer,
  customer_stage_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    wo.id,
    wo.organization_id,
    wo.sales_order_id,
    wo.sales_order_line_item_id,
    wo.part_number,
    wo.quantity_ordered,
    wo.due_date,
    wo.completion_date,
    case
      when progress.step_count = 0 or wo.quantity_ordered <= 0 then 0
      else least(100, round(
        progress.processed_total::numeric / (wo.quantity_ordered * progress.step_count) * 100
      )::integer)
    end as customer_progress_percent,
    case
      when wo.completion_date is not null then 'Complete'
      when progress.processed_total = 0 then 'Order received'
      else coalesce(current_stage.customer_stage_name, 'In production')
    end as customer_stage_name
  from public.work_orders wo
  join public.sales_orders so on so.id = wo.sales_order_id
  join public.profiles p
    on p.id = (select auth.uid())
    and p.role = 'customer'
    and p.organization_id = wo.organization_id
    and p.customer_id = so.customer_id
  cross join lateral (
    select
      count(*)::integer as step_count,
      coalesce(sum(least(step_activity.processed, wo.quantity_ordered)), 0)::integer as processed_total
    from public.customer_stage_mappings mapping
    cross join lateral (
      select coalesce(sum(pe.quantity) filter (
        where (pe.event_type = 'transfer' and pe.from_routing_step_id = mapping.routing_step_id)
          or (pe.event_type = 'scrap' and pe.routing_step_id = mapping.routing_step_id)
      ), 0)::integer as processed
      from public.production_events pe
      where pe.work_order_id = wo.id
        and pe.event_type <> 'reversal'
        and not exists (
          select 1 from public.production_events reversal where reversal.reversed_event_id = pe.id
        )
    ) step_activity
    where mapping.work_order_id = wo.id
  ) progress
  left join lateral (
    select mapping.customer_stage_name
    from public.customer_stage_mappings mapping
    where mapping.work_order_id = wo.id
      and exists (
        select 1
        from public.production_events pe
        where pe.work_order_id = wo.id
          and pe.event_type <> 'reversal'
          and not exists (
            select 1 from public.production_events reversal where reversal.reversed_event_id = pe.id
          )
          and (
            (pe.event_type in ('release', 'adjustment') and pe.routing_step_id = mapping.routing_step_id)
            or (pe.event_type = 'transfer' and pe.to_routing_step_id = mapping.routing_step_id)
          )
      )
    order by mapping.sequence_number desc
    limit 1
  ) current_stage on true
  where wo.archived_at is null
  order by wo.due_date, wo.id;
$$;
