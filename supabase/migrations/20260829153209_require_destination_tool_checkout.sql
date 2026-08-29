-- Prevent a transfer from entering an operation until that operation's
-- work-order-specific Tool Assemblies have physically been checked out.

create or replace function private.enforce_production_tool_checkout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tool record;
  v_latest_transaction text;
begin
  if new.event_type not in ('transfer', 'scrap') then
    return new;
  end if;

  for v_tool in
    select assembly.id, assembly.assembly_number, assembly.description
    from public.tool_assemblies as assembly
    where assembly.id in (
      select assignment.tool_assembly_id
      from public.work_order_operation_tools as assignment
      where assignment.work_order_operation_id = new.routing_step_id
         or (
           new.event_type = 'transfer'
           and new.to_routing_step_id is not null
           and assignment.work_order_operation_id = new.to_routing_step_id
         )
    )
    order by assembly.id
    for update of assembly
  loop
    select checkout.transaction_type
      into v_latest_transaction
    from public.tool_checkout_transactions as checkout
    where checkout.tool_assembly_id = v_tool.id
    order by checkout.event_sequence desc
    limit 1;

    if v_latest_transaction is distinct from 'CHECK_OUT' then
      raise exception using
        errcode = 'P0001',
        message = format(
          '%s · %s must be checked out before parts can enter or production can be recorded for this operation.',
          v_tool.assembly_number,
          v_tool.description
        );
    end if;
  end loop;

  return new;
end;
$$;

create function public.production_tool_checkout_requirements(
  p_work_order_id uuid,
  p_routing_step_id uuid
)
returns table (
  operation_role text,
  routing_step_id uuid,
  sequence_number integer,
  routing_step_name text,
  tool_assembly_id uuid,
  assembly_number text,
  tool_name text,
  tool_description text,
  checked_out boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with requested_step as (
    select current_step.id, current_step.work_order_id, current_step.sequence_number
    from public.routing_steps as current_step
    join public.work_orders as work_order
      on work_order.id = current_step.work_order_id
     and work_order.id = p_work_order_id
    where current_step.id = p_routing_step_id
  ), target_steps as (
    select 'current'::text as operation_role, current_step.*
    from public.routing_steps as current_step
    join requested_step on requested_step.id = current_step.id
    union all
    select 'next'::text, next_step.*
    from requested_step
    join lateral (
      select candidate.*
      from public.routing_steps as candidate
      where candidate.work_order_id = requested_step.work_order_id
        and candidate.sequence_number > requested_step.sequence_number
      order by candidate.sequence_number
      limit 1
    ) as next_step on true
  )
  select
    target.operation_role,
    target.id,
    target.sequence_number,
    target.routing_step_name,
    assembly.id,
    assembly.assembly_number,
    assembly.description,
    assembly.notes,
    coalesce(latest.transaction_type = 'CHECK_OUT', false)
  from target_steps as target
  join public.work_order_operation_tools as assignment
    on assignment.work_order_operation_id = target.id
  join public.tool_assemblies as assembly
    on assembly.id = assignment.tool_assembly_id
  left join lateral (
    select checkout.transaction_type
    from public.tool_checkout_transactions as checkout
    where checkout.tool_assembly_id = assembly.id
    order by checkout.event_sequence desc
    limit 1
  ) as latest on true
  order by
    case target.operation_role when 'current' then 0 else 1 end,
    assignment.sequence_number,
    assignment.tool_number;
$$;

comment on function public.production_tool_checkout_requirements(uuid, uuid) is
  'STABLE narrow shop-floor read contract for current and destination operation Tool Assembly checkout requirements.';

revoke all on function public.production_tool_checkout_requirements(uuid, uuid) from public, anon;
grant execute on function public.production_tool_checkout_requirements(uuid, uuid) to authenticated;
