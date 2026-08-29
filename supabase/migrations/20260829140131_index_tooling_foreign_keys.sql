-- Cover tooling foreign keys used for tenant cleanup checks, historical joins,
-- and assignment lookups without changing the lightweight domain model.

create index if not exists tool_assemblies_created_by_idx
  on public.tool_assemblies(created_by) where created_by is not null;

create index if not exists tool_checkout_transactions_assembly_organization_idx
  on public.tool_checkout_transactions(tool_assembly_id, organization_id);

create index if not exists routing_operation_tools_organization_idx
  on public.routing_operation_tools(organization_id);
create index if not exists routing_operation_tools_assembly_organization_idx
  on public.routing_operation_tools(tool_assembly_id, organization_id);

create index if not exists work_order_operation_tools_organization_idx
  on public.work_order_operation_tools(organization_id);
create index if not exists work_order_operation_tools_assembly_organization_idx
  on public.work_order_operation_tools(tool_assembly_id, organization_id);
create index if not exists work_order_operation_tools_source_idx
  on public.work_order_operation_tools(source_routing_operation_tool_id)
  where source_routing_operation_tool_id is not null;
