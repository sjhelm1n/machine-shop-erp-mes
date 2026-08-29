alter table public.organizations
  add column plant_timezone text not null default 'America/Detroit';

alter table public.organizations
  add constraint organizations_plant_timezone_nonempty_check
  check (length(btrim(plant_timezone)) > 0);

comment on column public.organizations.plant_timezone is
  'IANA timezone that owns ShopCore manufacturing business-date and timestamp display semantics.';

create or replace function private.refresh_work_order_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released integer;
  v_final_good integer;
  v_scrap integer;
  v_ordered integer;
  v_plant_timezone text;
begin
  select work_order.quantity_ordered, organization.plant_timezone
    into strict v_ordered, v_plant_timezone
  from public.work_orders as work_order
  join public.organizations as organization on organization.id = work_order.organization_id
  where work_order.id = new.work_order_id;

  select
    coalesce(sum(event.quantity) filter (where event.event_type in ('release', 'adjustment')), 0)::integer,
    coalesce(sum(event.quantity) filter (where event.event_type = 'transfer' and event.to_routing_step_id is null), 0)::integer,
    coalesce(sum(event.quantity) filter (where event.event_type = 'scrap'), 0)::integer
    into v_released, v_final_good, v_scrap
  from public.production_events as event
  where event.work_order_id = new.work_order_id
    and event.event_type <> 'reversal'
    and not exists (
      select 1
      from public.production_events as reversal
      where reversal.reversed_event_id = event.id
    );

  update public.work_orders
  set completion_date = case
    when v_released > 0
      and v_released - v_final_good - v_scrap = 0
      and v_final_good >= v_ordered
      then coalesce(completion_date, (new.created_at at time zone v_plant_timezone)::date)
    else null
  end
  where id = new.work_order_id;

  return new;
end;
$$;

create function public.work_order_step_metrics(p_work_order_ids uuid[])
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
    select event.*
    from public.production_events as event
    join requested_work_orders as requested on requested.id = event.work_order_id
    where event.event_type <> 'reversal'
      and not exists (
        select 1
        from public.production_events as reversal
        where reversal.reversed_event_id = event.id
      )
  ),
  step_totals as (
    select
      step.work_order_id,
      step.id as step_id,
      step.sequence_number,
      requested.released_at,
      coalesce(sum(event.quantity) filter (
        where (event.event_type in ('release', 'adjustment') and event.routing_step_id = step.id)
          or (event.event_type = 'transfer' and event.to_routing_step_id = step.id)
      ), 0)::integer as entered,
      coalesce(sum(event.quantity) filter (
        where event.event_type = 'transfer' and event.from_routing_step_id = step.id
      ), 0)::integer as transferred,
      coalesce(sum(event.quantity) filter (
        where event.event_type = 'scrap' and event.routing_step_id = step.id
      ), 0)::integer as scrapped,
      min(event.created_at) filter (
        where (event.event_type in ('release', 'adjustment') and event.routing_step_id = step.id)
          or (event.event_type = 'transfer' and event.to_routing_step_id = step.id)
      ) as first_entered_at,
      min(event.created_at) filter (
        where (event.event_type = 'transfer' and event.from_routing_step_id = step.id)
          or (event.event_type = 'scrap' and event.routing_step_id = step.id)
      ) as first_started_at,
      max(event.created_at) filter (
        where event.routing_step_id = step.id
          or event.from_routing_step_id = step.id
          or event.to_routing_step_id = step.id
      ) as last_activity_at
    from requested_work_orders as requested
    join public.routing_steps as step on step.work_order_id = requested.id
    left join active_events as event on event.work_order_id = requested.id
    group by step.work_order_id, step.id, step.sequence_number, requested.released_at
  ),
  step_balances as (
    select
      totals.*,
      greatest(0, totals.entered - totals.transferred - totals.scrapped)::integer as available,
      (totals.transferred + totals.scrapped)::integer as processed,
      coalesce(
        totals.first_entered_at,
        case
          when row_number() over (
            partition by totals.work_order_id
            order by totals.sequence_number, totals.step_id
          ) = 1 then totals.released_at
        end
      ) as resolved_entered_at
    from step_totals as totals
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
  'Set-wise manufacturer-facing routing metrics for a bounded collection of work orders; raw event history remains authoritative.';

revoke all on function public.work_order_step_metrics(uuid[]) from public, anon;
grant execute on function public.work_order_step_metrics(uuid[]) to authenticated;
