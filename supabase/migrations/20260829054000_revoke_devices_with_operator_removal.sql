create or replace function private.revoke_removed_operator_devices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.production_devices%rowtype;
begin
  for v_device in
    select * from public.production_devices where assigned_operator_id = old.id
  loop
    update public.production_devices
    set assigned_operator_id = null,
        revoked_at = coalesce(revoked_at, now())
    where id = v_device.id;

    insert into public.audit_log(
      organization_id, entity_type, entity_id, record_id, operation,
      actor_id, diff, source
    ) values (
      old.organization_id, 'production_devices', v_device.id, v_device.id,
      'REVOKE', auth.uid(),
      jsonb_build_object('reason', 'assigned_operator_removed', 'operator_id', old.id),
      'remove_user_access'
    );
  end loop;
  return old;
end;
$$;

create trigger profiles_revoke_operator_devices
before delete on public.profiles
for each row execute function private.revoke_removed_operator_devices();

-- set_by is the operator who created the PIN. Its history is retained in the
-- append-only audit row, while the live hash must disappear with that profile.
alter table public.production_operator_codes
  drop constraint production_operator_codes_set_by_fkey,
  drop constraint production_operator_codes_set_by_organization_fkey;
alter table public.production_operator_codes
  add constraint production_operator_codes_set_by_fkey
    foreign key (set_by) references public.profiles(id) on delete cascade,
  add constraint production_operator_codes_set_by_organization_fkey
    foreign key (set_by, organization_id) references public.profiles(id, organization_id) on delete cascade;

revoke all on function private.revoke_removed_operator_devices() from public, anon, authenticated;
