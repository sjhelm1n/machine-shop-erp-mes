-- A Tool Assembly must physically leave the crib before an assigned operation
-- can record production, and it cannot return while that operation is active.

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
    from public.work_order_operation_tools as assignment
    join public.tool_assemblies as assembly on assembly.id = assignment.tool_assembly_id
    where assignment.work_order_operation_id = new.routing_step_id
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

revoke all on function private.enforce_production_tool_checkout() from public, anon, authenticated;

drop trigger if exists production_event_tool_checkout_guard on public.production_events;
create trigger production_event_tool_checkout_guard
before insert on public.production_events
for each row execute function private.enforce_production_tool_checkout();

create or replace function public.record_tool_checkout(
  p_tool_assembly_id uuid,
  p_transaction_type text,
  p_quantity integer,
  p_note text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tool public.tool_assemblies%rowtype;
  v_is_checked_out boolean := false;
  v_id uuid;
  v_actor_name text;
  v_hash text;
  v_existing_hash text;
begin
  select * into v_tool from public.tool_assemblies where id = p_tool_assembly_id for update;
  if not found or not (select private.is_manufacturer(v_tool.organization_id)) then
    raise exception using errcode = 'P0001', message = 'Tool assembly not found or access denied';
  end if;
  if p_transaction_type not in ('CHECK_OUT', 'CHECK_IN') then raise exception 'Transaction type must be CHECK_OUT or CHECK_IN'; end if;
  if p_quantity is distinct from 1 then raise exception 'Each Tool Assembly is individually tracked; quantity must be one'; end if;
  if p_request_id is null then raise exception 'A request id is required'; end if;

  v_hash := md5(p_tool_assembly_id::text || p_transaction_type || '1' || coalesce(p_note, ''));
  select id, request_hash into v_id, v_existing_hash
  from public.tool_checkout_transactions
  where organization_id = v_tool.organization_id and request_id = p_request_id;
  if found then
    if v_existing_hash <> v_hash then raise exception 'Checkout request id was already used for a different transaction'; end if;
    return v_id;
  end if;

  select transaction_type = 'CHECK_OUT'
    into v_is_checked_out
  from public.tool_checkout_transactions
  where tool_assembly_id = p_tool_assembly_id
  order by event_sequence desc
  limit 1;
  v_is_checked_out := coalesce(v_is_checked_out, false);

  if p_transaction_type = 'CHECK_OUT' and v_is_checked_out then
    raise exception 'Tool assembly is already checked out';
  end if;
  if p_transaction_type = 'CHECK_IN' and not v_is_checked_out then
    raise exception 'Tool assembly is not checked out';
  end if;
  if p_transaction_type = 'CHECK_IN' and coalesce((
    select status.quantity_in_use
    from public.tool_assembly_status as status
    where status.tool_assembly_id = p_tool_assembly_id
  ), 0) > 0 then
    raise exception 'Tool assembly cannot be checked in while it is in use';
  end if;

  select display_name into v_actor_name
  from public.profiles
  where id = auth.uid() and organization_id = v_tool.organization_id;
  if v_actor_name is null then raise exception using errcode = 'P0001', message = 'Shop user profile not found or access denied'; end if;

  perform set_config('shopcore.audit_source', 'record_tool_checkout', true);
  insert into public.tool_checkout_transactions(
    organization_id, tool_assembly_id, transaction_type, note,
    actor_id, actor_display_name, request_id, request_hash
  ) values (
    v_tool.organization_id, p_tool_assembly_id, p_transaction_type,
    coalesce(p_note, ''), auth.uid(), v_actor_name, p_request_id, v_hash
  ) returning id into v_id;
  return v_id;
end;
$$;

comment on function public.record_tool_checkout(uuid, text, integer, text, uuid) is
  'Retry-safe one-asset checkout transition. Check-in is rejected while the Tool Assembly is actively used.';
