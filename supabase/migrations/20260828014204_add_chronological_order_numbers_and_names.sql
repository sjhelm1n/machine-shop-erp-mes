alter table public.sales_orders
  add column sales_order_name text;

alter table public.work_orders
  add column work_order_name text;

update public.sales_orders
set sales_order_name = sales_order_number;

update public.work_orders
set work_order_name = work_order_number;

alter table public.sales_orders
  alter column sales_order_name set not null,
  add constraint sales_orders_sales_order_name_check
    check (length(btrim(sales_order_name)) > 0);

alter table public.work_orders
  alter column work_order_name set not null,
  add constraint work_orders_work_order_name_check
    check (length(btrim(work_order_name)) > 0);

comment on column public.sales_orders.sales_order_number is
  'Organization-scoped chronological identifier generated when the sales order is inserted.';

comment on column public.sales_orders.sales_order_name is
  'User-entered sales-order label; defaults to sales_order_number when omitted.';

comment on column public.work_orders.work_order_number is
  'Organization-scoped chronological identifier generated when the work order is inserted.';

comment on column public.work_orders.work_order_name is
  'User-entered work-order label; defaults to work_order_number when omitted.';

create or replace function private.assign_sales_order_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_number bigint;
  v_number_text text;
begin
  if new.sales_order_number is null or btrim(new.sales_order_number) = '' then
    perform pg_advisory_xact_lock(
      hashtextextended('sales_order_number:' || new.organization_id::text, 0)
    );

    select coalesce(max(
      case
        when sales_order_number ~ '^[0-9]+$' then sales_order_number::bigint
        else null
      end
    ), 0) + 1
    into v_next_number
    from public.sales_orders
    where organization_id = new.organization_id;

    v_number_text := v_next_number::text;
    new.sales_order_number := case
      when length(v_number_text) < 4 then lpad(v_number_text, 4, '0')
      else v_number_text
    end;
  end if;

  new.sales_order_name := coalesce(
    nullif(btrim(new.sales_order_name), ''),
    new.sales_order_number
  );

  return new;
end;
$$;

create or replace function private.assign_work_order_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_number bigint;
  v_number_text text;
begin
  if new.work_order_number is null or btrim(new.work_order_number) = '' then
    perform pg_advisory_xact_lock(
      hashtextextended('work_order_number:' || new.organization_id::text, 0)
    );

    select coalesce(max(
      case
        when work_order_number ~ '^[0-9]+$' then work_order_number::bigint
        else null
      end
    ), 0) + 1
    into v_next_number
    from public.work_orders
    where organization_id = new.organization_id;

    v_number_text := v_next_number::text;
    new.work_order_number := case
      when length(v_number_text) < 6 then lpad(v_number_text, 6, '0')
      else v_number_text
    end;
  end if;

  new.work_order_name := coalesce(
    nullif(btrim(new.work_order_name), ''),
    new.work_order_number
  );

  return new;
end;
$$;

revoke all on function private.assign_sales_order_identity() from public, anon, authenticated;
revoke all on function private.assign_work_order_identity() from public, anon, authenticated;

create trigger sales_order_identity
before insert on public.sales_orders
for each row
execute function private.assign_sales_order_identity();

create trigger work_order_identity
before insert on public.work_orders
for each row
execute function private.assign_work_order_identity();

create or replace function public.create_sales_order(p_order jsonb, p_lines jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_line jsonb;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one sales-order line is required';
  end if;

  insert into public.sales_orders(
    organization_id,
    sales_order_name,
    customer_id,
    customer_name,
    customer_address,
    customer_po_number,
    ship_to_address,
    bill_to_address,
    date_received,
    order_due_date,
    notes
  )
  values (
    (p_order->>'organization_id')::uuid,
    coalesce(
      nullif(btrim(p_order->>'sales_order_name'), ''),
      nullif(btrim(p_order->>'sales_order_number'), '')
    ),
    (p_order->>'customer_id')::uuid,
    p_order->>'customer_name',
    coalesce(p_order->>'customer_address', ''),
    p_order->>'customer_po_number',
    coalesce(p_order->>'ship_to_address', ''),
    coalesce(p_order->>'bill_to_address', ''),
    (p_order->>'date_received')::date,
    (p_order->>'order_due_date')::date,
    coalesce(p_order->>'notes', '')
  )
  returning id into v_order_id;

  for v_line in
    select value from jsonb_array_elements(p_lines)
  loop
    insert into public.sales_order_line_items(
      sales_order_id,
      line_number,
      part_number,
      description,
      manufactured_item,
      pricing_type,
      quantity,
      unit_price,
      flat_rate_amount,
      sort_order
    )
    values (
      v_order_id,
      (v_line->>'line_number')::integer,
      nullif(v_line->>'part_number', ''),
      v_line->>'description',
      (v_line->>'manufactured_item')::boolean,
      v_line->>'pricing_type',
      (v_line->>'quantity')::integer,
      nullif(v_line->>'unit_price', '')::numeric,
      nullif(v_line->>'flat_rate_amount', '')::numeric,
      (v_line->>'sort_order')::integer
    );
  end loop;

  return v_order_id;
end;
$$;

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
    work_order_name,
    sales_order_id,
    sales_order_line_item_id,
    part_number,
    quantity_ordered,
    due_date,
    notes
  )
  values (
    (p_work_order->>'organization_id')::uuid,
    coalesce(
      nullif(btrim(p_work_order->>'work_order_name'), ''),
      nullif(btrim(p_work_order->>'work_order_number'), '')
    ),
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

