-- Allow manufacturer users to maintain Work Order header details and only the
-- routing definition that production history has not yet consumed.

create or replace function private.update_work_order(
  p_work_order_id uuid,
  p_due_date date,
  p_notes text,
  p_routing jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_order public.work_orders%rowtype;
  v_existing_step public.routing_steps%rowtype;
  v_step jsonb;
  v_step_id uuid;
  v_max_sequence integer;
  v_submitted_count integer;
  v_distinct_count integer;
  v_has_new_steps boolean;
begin
  select *
    into v_work_order
  from public.work_orders
  where id = p_work_order_id
  for update;

  if not found or not (select private.is_manufacturer(v_work_order.organization_id)) then
    raise exception using errcode = 'P0001', message = 'Work order not found or access denied';
  end if;
  if v_work_order.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'Restore the work order before editing it';
  end if;
  if p_due_date is null then
    raise exception 'A due date is required';
  end if;
  if coalesce(jsonb_typeof(p_routing), 'null') <> 'array' then
    raise exception 'Routing must be an array';
  end if;
  if jsonb_array_length(p_routing) not between 1 and 100 then
    raise exception 'A work order requires between 1 and 100 routing steps';
  end if;

  select count(*), count(distinct value ->> 'id')
    into v_submitted_count, v_distinct_count
  from jsonb_array_elements(p_routing);

  if v_submitted_count <> v_distinct_count
     or exists (
       select 1
       from jsonb_array_elements(p_routing) as submitted(value)
       where coalesce(submitted.value ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     ) then
    raise exception 'Every routing step requires a unique valid id';
  end if;

  if exists (
    select 1
    from public.routing_steps as existing
    where existing.work_order_id = p_work_order_id
      and not exists (
        select 1
        from jsonb_array_elements(p_routing) as submitted(value)
        where submitted.value ->> 'id' = existing.id::text
      )
  ) then
    raise exception 'Existing routing steps cannot be removed';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_routing) as submitted(value)
    join public.routing_steps as existing on existing.id = (submitted.value ->> 'id')::uuid
    where existing.work_order_id <> p_work_order_id
  ) then
    raise exception using errcode = 'P0001', message = 'Routing step not found or access denied';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(p_routing) as submitted(value)
    where not exists (
      select 1
      from public.routing_steps as existing
      where existing.id = (submitted.value ->> 'id')::uuid
    )
  ) into v_has_new_steps;

  if v_has_new_steps and v_work_order.completion_date is not null then
    raise exception 'Routing steps cannot be added to a completed work order';
  end if;
  if v_has_new_steps and exists (
    select 1
    from public.production_events as event
    where event.work_order_id = p_work_order_id
      and event.event_type = 'transfer'
      and event.to_routing_step_id is null
      and not exists (
        select 1
        from public.production_events as reversal
        where reversal.reversed_event_id = event.id
      )
  ) then
    raise exception 'Routing steps cannot be added after quantity has exited the final step';
  end if;

  perform set_config('shopcore.audit_source', 'update_work_order', true);

  update public.work_orders
  set due_date = p_due_date,
      notes = coalesce(p_notes, '')
  where id = p_work_order_id;

  select coalesce(max(sequence_number), 0)
    into v_max_sequence
  from public.routing_steps
  where work_order_id = p_work_order_id;

  for v_step in
    select value from jsonb_array_elements(p_routing)
  loop
    if jsonb_typeof(v_step) <> 'object'
       or length(btrim(coalesce(v_step ->> 'routing_step_name', ''))) not between 1 and 120
       or length(btrim(coalesce(v_step ->> 'customer_stage_name', ''))) not between 1 and 120 then
      raise exception 'Every routing step requires an internal step and customer stage of 1 to 120 characters';
    end if;

    v_step_id := (v_step ->> 'id')::uuid;
    select *
      into v_existing_step
    from public.routing_steps
    where id = v_step_id;

    if found then
      if exists (
        select 1
        from public.production_events as event
        where event.work_order_id = p_work_order_id
          and (
            (event.event_type in ('release', 'adjustment') and event.to_routing_step_id = v_step_id)
            or (event.event_type = 'transfer' and event.to_routing_step_id = v_step_id)
          )
      ) then
        if v_existing_step.routing_step_name is distinct from btrim(v_step ->> 'routing_step_name')
           or v_existing_step.customer_stage_name is distinct from btrim(v_step ->> 'customer_stage_name')
           or v_existing_step.work_instructions is distinct from coalesce(v_step ->> 'work_instructions', '') then
          raise exception 'Routing step % has already been entered and cannot be changed', v_existing_step.sequence_number;
        end if;
      else
        update public.routing_steps
        set routing_step_name = btrim(v_step ->> 'routing_step_name'),
            customer_stage_name = btrim(v_step ->> 'customer_stage_name'),
            work_instructions = coalesce(v_step ->> 'work_instructions', '')
        where id = v_step_id;
      end if;
    else
      v_max_sequence := v_max_sequence + 10;
      insert into public.routing_steps(
        id,
        work_order_id,
        sequence_number,
        routing_step_name,
        customer_stage_name,
        work_instructions
      ) values (
        v_step_id,
        p_work_order_id,
        v_max_sequence,
        btrim(v_step ->> 'routing_step_name'),
        btrim(v_step ->> 'customer_stage_name'),
        coalesce(v_step ->> 'work_instructions', '')
      );
    end if;
  end loop;
end;
$$;

create or replace function public.update_work_order(
  p_work_order_id uuid,
  p_due_date date,
  p_notes text,
  p_routing jsonb
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_work_order(p_work_order_id, p_due_date, p_notes, p_routing);
$$;

revoke all on function private.update_work_order(uuid, date, text, jsonb) from public, anon;
revoke all on function public.update_work_order(uuid, date, text, jsonb) from public, anon;
grant execute on function private.update_work_order(uuid, date, text, jsonb) to authenticated;
grant execute on function public.update_work_order(uuid, date, text, jsonb) to authenticated;

comment on function public.update_work_order(uuid, date, text, jsonb) is
  'Atomically updates a Work Order due date, traveler notes, unentered routing definitions, and retry-safe appended routing steps without rewriting production history.';
