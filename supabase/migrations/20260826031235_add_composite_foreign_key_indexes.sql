-- Cover composite foreign keys used to enforce organization/customer consistency.
create index sales_orders_customer_organization_idx
  on public.sales_orders(customer_id, organization_id);

create index work_orders_line_item_sales_order_idx
  on public.work_orders(sales_order_line_item_id, sales_order_id);

create index work_orders_sales_order_organization_idx
  on public.work_orders(sales_order_id, organization_id);

create index production_events_work_order_organization_idx
  on public.production_events(work_order_id, organization_id);

create index customer_messages_customer_organization_idx
  on public.customer_messages(customer_id, organization_id);

create index customer_messages_sales_order_customer_organization_idx
  on public.customer_messages(sales_order_id, customer_id, organization_id);

create index invoices_customer_organization_idx
  on public.invoices(customer_id, organization_id);

create index invoices_sales_order_customer_organization_idx
  on public.invoices(sales_order_id, customer_id, organization_id);
