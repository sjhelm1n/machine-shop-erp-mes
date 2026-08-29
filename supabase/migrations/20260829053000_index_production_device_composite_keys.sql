create index production_device_sessions_device_organization_idx
  on public.production_device_sessions(device_id, organization_id);

create index production_operator_codes_profile_organization_idx
  on public.production_operator_codes(profile_id, organization_id);
