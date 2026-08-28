create or replace function public.create_work_order(p_work_order jsonb, p_routing jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_work_order_id uuid;
  v_step jsonb;
  v_step_id uuid;
  v_first_step_id uuid;
begin
  if jsonb_typeof(p_routing) <> 'array' or jsonb_array_length(p_routing) = 0 then
    raise exception 'At least one routing step is required';
  end if;

  if not exists (
    select 1
    from public.sales_order_line_items li
    where li.id = (p_work_order->>'sales_order_line_item_id')::uuid
      and li.sales_order_id = (p_work_order->>'sales_order_id')::uuid
      and li.manufactured_item
  ) then
    raise exception 'Work orders must be created from a manufactured sales-order line';
  end if;

  insert into public.work_orders(
    organization_id,
    work_order_number,
    sales_order_id,
    sales_order_line_item_id,
    part_number,
    quantity_ordered,
    due_date,
    notes
  )
  values (
    (p_work_order->>'organization_id')::uuid,
    p_work_order->>'work_order_number',
    (p_work_order->>'sales_order_id')::uuid,
    (p_work_order->>'sales_order_line_item_id')::uuid,
    p_work_order->>'part_number',
    (p_work_order->>'quantity_ordered')::integer,
    (p_work_order->>'due_date')::date,
    coalesce(p_work_order->>'notes', '')
  )
  returning id into v_work_order_id;

  for v_step in
    select value
    from jsonb_array_elements(p_routing)
    order by (value->>'sequence_number')::integer
  loop
    insert into public.routing_steps(
      work_order_id,
      sequence_number,
      routing_step_name,
      customer_stage_name,
      work_instructions
    )
    values (
      v_work_order_id,
      (v_step->>'sequence_number')::integer,
      v_step->>'routing_step_name',
      coalesce(v_step->>'customer_stage_name', 'In production'),
      coalesce(v_step->>'work_instructions', '')
    )
    returning id into v_step_id;

    if v_first_step_id is null then
      v_first_step_id := v_step_id;
    end if;
  end loop;

  insert into public.production_events(
    organization_id,
    work_order_id,
    routing_step_id,
    event_type,
    quantity,
    to_routing_step_id
  )
  values (
    (p_work_order->>'organization_id')::uuid,
    v_work_order_id,
    v_first_step_id,
    'release',
    (p_work_order->>'quantity_ordered')::integer,
    v_first_step_id
  );

  return v_work_order_id;
end;
$$;

alter table public.routing_steps
  drop column work_instructions_revision;

