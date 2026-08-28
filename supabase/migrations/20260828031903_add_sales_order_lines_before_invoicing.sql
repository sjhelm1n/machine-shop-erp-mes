create or replace function public.add_sales_order_line(
  p_sales_order_id uuid,
  p_line jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoiced_at timestamptz;
  v_line_id uuid;
  v_line_number integer;
  v_sort_order integer;
begin
  select sales_order.invoiced_at
    into v_invoiced_at
  from public.sales_orders as sales_order
  where sales_order.id = p_sales_order_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Sales order not found or access denied';
  end if;

  if v_invoiced_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'Line items cannot be added after the sales order is invoiced';
  end if;

  select
    coalesce(max(line_item.line_number), 0) + 1,
    coalesce(max(line_item.sort_order), 0) + 10
  into v_line_number, v_sort_order
  from public.sales_order_line_items as line_item
  where line_item.sales_order_id = p_sales_order_id;

  insert into public.sales_order_line_items (
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
    p_sales_order_id,
    v_line_number,
    nullif(btrim(p_line ->> 'part_number'), ''),
    btrim(p_line ->> 'description'),
    coalesce((p_line ->> 'manufactured_item')::boolean, false),
    p_line ->> 'pricing_type',
    (p_line ->> 'quantity')::integer,
    nullif(p_line ->> 'unit_price', '')::numeric,
    nullif(p_line ->> 'flat_rate_amount', '')::numeric,
    v_sort_order
  )
  returning id into v_line_id;

  return v_line_id;
end;
$$;

comment on function public.add_sales_order_line(uuid, jsonb) is
  'Adds the next line to a manufacturer-visible sales order while atomically preventing additions after invoicing.';

revoke all on function public.add_sales_order_line(uuid, jsonb) from public;
revoke all on function public.add_sales_order_line(uuid, jsonb) from anon;
grant execute on function public.add_sales_order_line(uuid, jsonb) to authenticated;
