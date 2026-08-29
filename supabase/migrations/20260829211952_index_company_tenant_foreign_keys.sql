-- Cover the remaining tenant-safe foreign keys for parent updates/deletes.
create index customer_stage_mappings_step_work_order_organization_idx
  on public.customer_stage_mappings(routing_step_id, work_order_id, organization_id);

create index profiles_customer_organization_idx
  on public.profiles(customer_id, organization_id);
