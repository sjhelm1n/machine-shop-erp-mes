alter table public.profiles
  add column is_super_admin boolean not null default false;

alter table public.profiles
  add constraint profiles_super_admin_is_plant_staff_check check (
    not is_super_admin
    or (role = 'manufacturer'::public.profile_role and customer_id is null)
  );

create unique index profiles_one_super_admin_per_organization_idx
  on public.profiles(organization_id)
  where is_super_admin;

select set_config('shopcore.audit_source', 'backfill_plant_super_admin', true);

with first_plant_accounts as (
  select distinct on (organization_id) id
  from public.profiles
  where role = 'manufacturer'::public.profile_role
  order by organization_id, created_at, id
)
update public.profiles as profile
set is_super_admin = true
from first_plant_accounts
where profile.id = first_plant_accounts.id;

create or replace function private.assign_first_plant_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role <> 'manufacturer'::public.profile_role then
    new.is_super_admin := false;
    return new;
  end if;

  -- Serialize first-account creation per organization so concurrent inserts
  -- cannot both claim, or both miss, the protected role.
  perform 1
  from public.organizations
  where id = new.organization_id
  for update;

  new.is_super_admin := not exists (
    select 1
    from public.profiles
    where organization_id = new.organization_id
      and role = 'manufacturer'::public.profile_role
  );

  return new;
end;
$$;

create or replace function private.protect_plant_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_super_admin then
      raise exception 'The plant super admin cannot be removed' using errcode = '42501';
    end if;
    return old;
  end if;

  if old.is_super_admin and (
    not new.is_super_admin
    or new.role <> 'manufacturer'::public.profile_role
    or new.organization_id <> old.organization_id
    or new.customer_id is not null
  ) then
    raise exception 'The plant super admin assignment cannot be changed' using errcode = '42501';
  end if;

  if not old.is_super_admin and new.is_super_admin then
    raise exception 'Super admin is assigned automatically to the first plant account' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.assign_first_plant_super_admin() from public, anon, authenticated;
revoke all on function private.protect_plant_super_admin() from public, anon, authenticated;

create trigger profiles_assign_first_plant_super_admin
before insert on public.profiles
for each row execute function private.assign_first_plant_super_admin();

create trigger profiles_protect_plant_super_admin
before update or delete on public.profiles
for each row execute function private.protect_plant_super_admin();

create or replace function private.remove_user_access(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
begin
  select * into v_actor from public.profiles where id = (select auth.uid());
  select * into v_target from public.profiles where id = p_user_id for update;

  if v_actor.id is null or v_target.id is null then
    raise exception 'User not found or access denied' using errcode = '42501';
  end if;

  if v_target.is_super_admin then
    raise exception 'The plant super admin cannot be removed' using errcode = '42501';
  end if;

  if v_actor.id = v_target.id then
    raise exception 'You cannot remove your own access';
  end if;

  if v_actor.organization_id <> v_target.organization_id
    or (
      v_actor.role = 'customer'
      and (
        v_target.role <> 'customer'
        or v_actor.customer_id is distinct from v_target.customer_id
      )
    )
  then
    raise exception 'User not found or access denied' using errcode = '42501';
  end if;

  if v_target.role = 'manufacturer' then
    perform 1
    from public.organizations
    where id = v_target.organization_id
    for update;

    if (
      select count(*)
      from public.profiles
      where organization_id = v_target.organization_id and role = 'manufacturer'
    ) <= 1 then
      raise exception 'The last plant staff user cannot be removed';
    end if;
  end if;

  perform set_config('shopcore.audit_source', 'remove_user_access', true);
  delete from public.profiles where id = v_target.id;
  return v_target.email;
end;
$$;

comment on column public.profiles.is_super_admin is
  'Immutable organization owner assigned to the first plant-team profile; this profile cannot be removed.';
