-- Entering an operation does not start its work. Destination tooling is
-- surfaced as a warning; checkout becomes mandatory when that operation
-- records its own transfer or scrap production event.

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
          '%s · %s must be checked out before production can be recorded for this operation.',
          v_tool.assembly_number,
          v_tool.description
        );
    end if;
  end loop;

  return new;
end;
$$;
