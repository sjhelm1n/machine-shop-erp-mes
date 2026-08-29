-- The original completion trigger stored new.created_at::date, which resolved
-- the UTC calendar date. The plant-timezone trigger replacement corrected new
-- completions but intentionally did not rewrite existing rows. Correct only
-- rows that still match that legacy UTC derivation, using immutable active
-- production events as the source of the completion transition.
select set_config('shopcore.audit_source', 'backfill_plant_local_completion_dates', true);

with active_completion_events as (
  select
    work_order.id as work_order_id,
    work_order.completion_date,
    max(production_event.created_at) as completion_at,
    organization.plant_timezone
  from public.work_orders as work_order
  join public.organizations as organization
    on organization.id = work_order.organization_id
  join public.production_events as production_event
    on production_event.work_order_id = work_order.id
  where work_order.completion_date is not null
    and production_event.event_type <> 'reversal'
    and not exists (
      select 1
      from public.production_events as reversal
      where reversal.reversed_event_id = production_event.id
    )
  group by work_order.id, work_order.completion_date, organization.plant_timezone
), corrections as (
  select
    active.work_order_id,
    (active.completion_at at time zone active.plant_timezone)::date as plant_completion_date
  from active_completion_events as active
  where active.completion_date = active.completion_at::date
    and active.completion_date is distinct from
      (active.completion_at at time zone active.plant_timezone)::date
)
update public.work_orders as work_order
set completion_date = correction.plant_completion_date
from corrections as correction
where work_order.id = correction.work_order_id;
