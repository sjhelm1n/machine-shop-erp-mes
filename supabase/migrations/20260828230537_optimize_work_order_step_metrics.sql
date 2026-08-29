create or replace function public.work_order_step_metrics(p_work_order_ids uuid[])
returns table (
  work_order_id uuid,
  step_id uuid,
  entered integer,
  transferred integer,
  scrapped integer,
  available integer,
  processed integer,
  entered_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with requested_work_orders as (
    select work_order.id, work_order.released_at
    from public.work_orders as work_order
    where work_order.id = any(coalesce(p_work_order_ids, array[]::uuid[]))
  ),
  active_events as (
    select
      event.id,
      event.work_order_id,
      event.routing_step_id,
      event.event_type,
      event.quantity,
      event.from_routing_step_id,
      event.to_routing_step_id,
      event.created_at
    from public.production_events as event
    join requested_work_orders as requested on requested.id = event.work_order_id
    where event.event_type <> 'reversal'
      and not exists (
        select 1
        from public.production_events as reversal
        where reversal.reversed_event_id = event.id
      )
  ),
  event_contributions as (
    select
      event.work_order_id,
      event.routing_step_id as step_id,
      event.quantity::integer as entered,
      0::integer as transferred,
      0::integer as scrapped,
      event.created_at as entered_at,
      null::timestamptz as started_at,
      event.created_at as activity_at
    from active_events as event
    where event.event_type in ('release', 'adjustment')

    union all

    select
      event.work_order_id,
      event.to_routing_step_id,
      event.quantity::integer,
      0::integer,
      0::integer,
      event.created_at,
      null::timestamptz,
      event.created_at
    from active_events as event
    where event.event_type = 'transfer'
      and event.to_routing_step_id is not null

    union all

    select
      event.work_order_id,
      event.from_routing_step_id,
      0::integer,
      event.quantity::integer,
      0::integer,
      null::timestamptz,
      event.created_at,
      event.created_at
    from active_events as event
    where event.event_type = 'transfer'
      and event.from_routing_step_id is not null

    union all

    select
      event.work_order_id,
      event.routing_step_id,
      0::integer,
      0::integer,
      event.quantity::integer,
      null::timestamptz,
      event.created_at,
      event.created_at
    from active_events as event
    where event.event_type = 'scrap'
  ),
  contribution_totals as (
    select
      contribution.work_order_id,
      contribution.step_id,
      sum(contribution.entered)::integer as entered,
      sum(contribution.transferred)::integer as transferred,
      sum(contribution.scrapped)::integer as scrapped,
      min(contribution.entered_at) as first_entered_at,
      min(contribution.started_at) as first_started_at,
      max(contribution.activity_at) as last_activity_at
    from event_contributions as contribution
    group by contribution.work_order_id, contribution.step_id
  ),
  step_balances as (
    select
      step.work_order_id,
      step.id as step_id,
      step.sequence_number,
      coalesce(totals.entered, 0)::integer as entered,
      coalesce(totals.transferred, 0)::integer as transferred,
      coalesce(totals.scrapped, 0)::integer as scrapped,
      greatest(0, coalesce(totals.entered, 0) - coalesce(totals.transferred, 0) - coalesce(totals.scrapped, 0))::integer as available,
      (coalesce(totals.transferred, 0) + coalesce(totals.scrapped, 0))::integer as processed,
      coalesce(
        totals.first_entered_at,
        case
          when row_number() over (
            partition by step.work_order_id
            order by step.sequence_number, step.id
          ) = 1 then requested.released_at
        end
      ) as resolved_entered_at,
      totals.first_started_at,
      totals.last_activity_at
    from requested_work_orders as requested
    join public.routing_steps as step on step.work_order_id = requested.id
    left join contribution_totals as totals
      on totals.work_order_id = step.work_order_id
      and totals.step_id = step.id
  ),
  resolved as (
    select
      balances.*,
      coalesce(
        bool_and(balances.available = 0) over (
          partition by balances.work_order_id
          order by balances.sequence_number, balances.step_id
          rows between unbounded preceding and 1 preceding
        ),
        true
      ) as upstream_empty
    from step_balances as balances
  )
  select
    resolved.work_order_id,
    resolved.step_id,
    resolved.entered,
    resolved.transferred,
    resolved.scrapped,
    resolved.available,
    resolved.processed,
    resolved.resolved_entered_at,
    resolved.first_started_at,
    case
      when resolved.entered > 0
        and resolved.available = 0
        and resolved.upstream_empty
        and resolved.first_started_at is not null
        then resolved.last_activity_at
      else null
    end as completed_at
  from resolved
  order by resolved.work_order_id, resolved.sequence_number, resolved.step_id;
$$;

comment on function public.work_order_step_metrics(uuid[]) is
  'Set-wise manufacturer-facing routing metrics for a bounded collection of work orders; aggregates event contributions once per step and keeps raw event history authoritative.';
