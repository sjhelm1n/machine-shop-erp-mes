-- Explicit fail-closed policies document that browser roles never access the
-- device credential, PIN hash, or station-session tables directly.
create policy production_devices_no_client_access
on public.production_devices for all to anon, authenticated
using (false) with check (false);

create policy production_operator_codes_no_client_access
on public.production_operator_codes for all to anon, authenticated
using (false) with check (false);

create policy production_device_sessions_no_client_access
on public.production_device_sessions for all to anon, authenticated
using (false) with check (false);

-- Preserve tenant consistency even if future server code makes a mistake.
alter table public.profiles add constraint profiles_id_organization_unique unique (id, organization_id);
alter table public.production_devices add constraint production_devices_id_organization_unique unique (id, organization_id);
alter table public.production_devices add constraint production_devices_operator_organization_fkey
  foreign key (assigned_operator_id, organization_id) references public.profiles(id, organization_id) on delete restrict;
alter table public.production_devices add constraint production_devices_approver_organization_fkey
  foreign key (approved_by, organization_id) references public.profiles(id, organization_id) on delete restrict;
alter table public.production_operator_codes add constraint production_operator_codes_profile_organization_fkey
  foreign key (profile_id, organization_id) references public.profiles(id, organization_id) on delete cascade;
alter table public.production_operator_codes add constraint production_operator_codes_set_by_organization_fkey
  foreign key (set_by, organization_id) references public.profiles(id, organization_id) on delete restrict;
alter table public.production_device_sessions add constraint production_device_sessions_device_organization_fkey
  foreign key (device_id, organization_id) references public.production_devices(id, organization_id) on delete cascade;
alter table public.production_device_sessions add constraint production_device_sessions_operator_organization_fkey
  foreign key (operator_id, organization_id) references public.profiles(id, organization_id) on delete cascade;

create index production_devices_assigned_operator_idx
  on public.production_devices(assigned_operator_id, organization_id)
  where assigned_operator_id is not null;
create index production_devices_approved_by_idx
  on public.production_devices(approved_by, organization_id)
  where approved_by is not null;
create index production_operator_codes_set_by_idx
  on public.production_operator_codes(set_by, organization_id);
create index production_device_sessions_operator_idx
  on public.production_device_sessions(operator_id, organization_id, expires_at);
create index production_device_sessions_organization_idx
  on public.production_device_sessions(organization_id, expires_at);
