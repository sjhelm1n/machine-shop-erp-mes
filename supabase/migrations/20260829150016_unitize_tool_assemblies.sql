-- Every Tool Assembly is one uniquely identified physical asset. Preserve any
-- previously grouped units as separate generated assemblies before removing
-- redundant quantity storage.

set local lock_timeout = '5s';

do $$
declare
  v_tool public.tool_assemblies%rowtype;
  v_copy integer;
begin
  if exists (
    select 1 from public.tool_checkout_transactions where quantity <> 1
  ) then
    raise exception 'Grouped checkout history must be resolved before Tool Assemblies can be unitized';
  end if;

  perform set_config('shopcore.audit_source', 'unitize_tool_assemblies', true);

  for v_tool in
    select * from public.tool_assemblies where quantity_owned > 1 order by organization_id, assembly_number, id
  loop
    for v_copy in 2..v_tool.quantity_owned loop
      insert into public.tool_assemblies(
        organization_id, description, quantity_owned, notes, archived_at, created_by
      ) values (
        v_tool.organization_id, v_tool.description, 1, v_tool.notes,
        v_tool.archived_at, v_tool.created_by
      );
    end loop;
  end loop;
end;
$$;

drop view public.tool_assembly_status;

create or replace function public.save_tool_assembly(
  p_tool_assembly_id uuid, p_organization_id uuid, p_assembly_number text,
  p_description text, p_quantity_owned integer, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(p_tool_assembly_id, gen_random_uuid());
  v_existing_organization_id uuid;
begin
  if not (select private.is_manufacturer(p_organization_id)) then
    raise exception using errcode = 'P0001', message = 'Tool assembly not found or access denied';
  end if;
  if length(btrim(coalesce(p_description, ''))) > 240 then raise exception 'Tool Assembly name must be 240 characters or fewer'; end if;

  select organization_id
    into v_existing_organization_id
  from public.tool_assemblies
  where id = v_id
  for update;

  if found and v_existing_organization_id <> p_organization_id then
    raise exception using errcode = 'P0001', message = 'Tool assembly not found or access denied';
  end if;

  perform set_config('shopcore.audit_source', 'save_tool_assembly', true);

  if v_existing_organization_id is null then
    insert into public.tool_assemblies(id, organization_id, description, notes)
    values (v_id, p_organization_id, coalesce(p_description, ''), coalesce(p_notes, ''));
  else
    update public.tool_assemblies
    set description = coalesce(p_description, ''),
        notes = coalesce(p_notes, '')
    where id = v_id and organization_id = p_organization_id;
  end if;

  return v_id;
end;
$$;

comment on function public.save_tool_assembly(uuid, uuid, text, text, integer, text) is
  'Creates or edits one uniquely tracked Tool Assembly. Number and quantity arguments remain only for RPC compatibility.';

create or replace function public.record_tool_checkout(
  p_tool_assembly_id uuid, p_transaction_type text, p_quantity integer,
  p_note text, p_request_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
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
  order by created_at desc, id desc
  limit 1;
  v_is_checked_out := coalesce(v_is_checked_out, false);

  if p_transaction_type = 'CHECK_OUT' and v_is_checked_out then
    raise exception 'Tool assembly is already checked out';
  end if;
  if p_transaction_type = 'CHECK_IN' and not v_is_checked_out then
    raise exception 'Tool assembly is not checked out';
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
  'Records a one-unit checkout or check-in for one uniquely tracked Tool Assembly. The quantity argument remains only for RPC compatibility and must be one.';

alter table public.tool_checkout_transactions drop column quantity;
alter table public.tool_assemblies drop column quantity_owned;

create view public.tool_assembly_status with (security_invoker = true) as
with checked_out as (
  select distinct on (transaction.tool_assembly_id)
    transaction.tool_assembly_id,
    case when transaction.transaction_type = 'CHECK_OUT' then 1 else 0 end::integer as quantity_checked_out
  from public.tool_checkout_transactions transaction
  order by transaction.tool_assembly_id, transaction.created_at desc, transaction.id desc
), open_work_order_ids as (
  select work_order.organization_id, array_agg(work_order.id) as ids
  from public.work_orders work_order
  where work_order.archived_at is null and work_order.completion_date is null
  group by work_order.organization_id
), operation_metrics as (
  select requested.organization_id, metrics.*
  from open_work_order_ids requested
  cross join lateral public.work_order_step_metrics(requested.ids) metrics
), requirements as (
  select assignment.tool_assembly_id,
    count(*) filter (where metrics.started_at is not null and metrics.completed_at is null)::integer as quantity_in_use,
    count(*) filter (where metrics.started_at is null and metrics.completed_at is null)::integer as future_requirements
  from public.work_order_operation_tools assignment
  join operation_metrics metrics on metrics.step_id = assignment.work_order_operation_id
  group by assignment.tool_assembly_id
)
select assembly.id as tool_assembly_id, assembly.organization_id,
  coalesce(checked_out.quantity_checked_out, 0)::integer as quantity_checked_out,
  coalesce(requirements.quantity_in_use, 0)::integer as quantity_in_use,
  coalesce(requirements.future_requirements, 0)::integer as future_requirements,
  coalesce(requirements.quantity_in_use, 0) > 1 as usage_warning
from public.tool_assemblies assembly
left join checked_out on checked_out.tool_assembly_id = assembly.id
left join requirements on requirements.tool_assembly_id = assembly.id;

revoke all on public.tool_assembly_status from public, anon, authenticated;
grant select on public.tool_assembly_status to authenticated;
comment on view public.tool_assembly_status is
  'Derived checkout state, active operation usage, future requirements, and simultaneous-use warning for uniquely tracked Tool Assemblies.';
