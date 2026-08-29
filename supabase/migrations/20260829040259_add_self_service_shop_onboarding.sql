alter table public.organizations
  add column account_email_domain text,
  add column onboarding_completed_at timestamptz;

alter table public.organizations
  add constraint organizations_account_email_domain_check check (
    account_email_domain is null
    or (
      account_email_domain = lower(btrim(account_email_domain))
      and length(account_email_domain) between 3 and 253
      and account_email_domain like '%.%'
      and account_email_domain !~ '[^a-z0-9.-]'
      and account_email_domain not like '.%'
      and account_email_domain not like '%.'
      and account_email_domain not like '%..%'
    )
  );

-- Existing installations must not be forced back through first-run setup.
update public.organizations as organization
set onboarding_completed_at = now()
where exists (
  select 1 from public.profiles as profile
  where profile.organization_id = organization.id
);

-- Backfill an unambiguous business domain from the protected owner where safe.
with owner_domains as (
  select
    profile.organization_id,
    lower(split_part(profile.email, '@', 2)) as domain
  from public.profiles as profile
  where profile.is_super_admin
), unique_owner_domains as (
  select organization_id, domain
  from owner_domains
  where domain not in (
    'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
    'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com'
  )
    and domain like '%.%'
    and domain !~ '[^a-z0-9.-]'
    and domain not like '.%'
    and domain not like '%.'
    and domain not like '%..%'
    and (select count(*) from owner_domains duplicate where duplicate.domain = owner_domains.domain) = 1
)
update public.organizations as organization
set account_email_domain = owner.domain
from unique_owner_domains as owner
where owner.organization_id = organization.id
  and organization.account_email_domain is null;

create unique index organizations_account_email_domain_unique_idx
  on public.organizations(account_email_domain)
  where account_email_domain is not null;

comment on column public.organizations.account_email_domain is
  'Normalized, deployment-local business email domain allowed to claim this organization during self-service setup.';
comment on column public.organizations.onboarding_completed_at is
  'Timestamp recorded when the protected organization owner completes the first-run setup wizard.';

create or replace function private.claim_shop_account(
  p_display_name text,
  p_organization_name text,
  p_plant_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_email_confirmed_at timestamptz;
  v_domain text;
  v_display_name text := btrim(p_display_name);
  v_organization_name text := btrim(p_organization_name);
  v_timezone text := btrim(p_plant_timezone);
  v_organization public.organizations%rowtype;
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sign in with your verified email before creating the shop account' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'This account is already connected to a ShopCore organization';
  end if;

  select lower(btrim(email)), email_confirmed_at
  into v_email, v_email_confirmed_at
  from auth.users
  where id = v_user_id;

  if not found or v_email is null or v_email_confirmed_at is null then
    raise exception 'Verify your email before creating the shop account' using errcode = '42501';
  end if;

  if length(v_email) > 254
    or length(v_email) - length(replace(v_email, '@', '')) <> 1
  then
    raise exception 'A valid business email address is required';
  end if;

  v_domain := split_part(v_email, '@', 2);
  if length(v_domain) not between 3 and 253
    or v_domain not like '%.%'
    or v_domain ~ '[^a-z0-9.-]'
    or v_domain like '.%'
    or v_domain like '%.'
    or v_domain like '%..%'
  then
    raise exception 'A valid business email domain is required';
  end if;

  if v_domain = any (array[
    'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
    'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com'
  ]) then
    raise exception 'Use your company email address to create a ShopCore organization';
  end if;

  if length(v_display_name) not between 1 and 120 then
    raise exception 'Your name must be between 1 and 120 characters';
  end if;
  if length(v_organization_name) not between 1 and 160 then
    raise exception 'Shop name must be between 1 and 160 characters';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception 'Choose a valid plant timezone';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_domain, 0));

  if exists (
    select 1 from public.organizations
    where account_email_domain = v_domain
  ) then
    raise exception 'A ShopCore organization already exists for @%. Ask its administrator to invite you.', v_domain;
  end if;

  perform set_config('shopcore.audit_source', 'claim_shop_account', true);

  insert into public.organizations(name, plant_timezone, account_email_domain)
  values (v_organization_name, v_timezone, v_domain)
  returning * into v_organization;

  insert into public.profiles(
    id, organization_id, customer_id, email, display_name, role,
    invited_at, activated_at
  ) values (
    v_user_id, v_organization.id, null, v_email, v_display_name,
    'manufacturer'::public.profile_role, now(), now()
  )
  returning * into v_profile;

  if not v_profile.is_super_admin then
    raise exception 'The first organization account must be assigned super admin' using errcode = '23514';
  end if;

  insert into public.audit_log(
    organization_id, entity_type, entity_id, record_id, operation,
    actor_id, diff, source
  ) values (
    v_organization.id, 'organizations', v_organization.id, v_organization.id,
    'BOOTSTRAP', v_user_id,
    jsonb_build_object('new', jsonb_build_object(
      'name', v_organization.name,
      'plant_timezone', v_organization.plant_timezone,
      'account_email_domain', v_organization.account_email_domain
    )),
    'claim_shop_account'
  );

  return jsonb_build_object(
    'organizationId', v_organization.id,
    'profileId', v_profile.id,
    'isSuperAdmin', v_profile.is_super_admin
  );
exception
  when unique_violation then
    raise exception 'A ShopCore organization already exists for @%. Ask its administrator to invite you.', v_domain;
end;
$$;

create or replace function private.complete_my_organization_onboarding(
  p_organization_name text,
  p_plant_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_name text := btrim(p_organization_name);
  v_timezone text := btrim(p_plant_timezone);
  v_completed_at timestamptz;
begin
  select * into v_actor
  from public.profiles
  where id = (select auth.uid());

  if not found or v_actor.role <> 'manufacturer'::public.profile_role or not v_actor.is_super_admin then
    raise exception 'Only the organization super admin can complete first-run setup' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 160 then
    raise exception 'Shop name must be between 1 and 160 characters';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception 'Choose a valid plant timezone';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_actor.organization_id::text, 0));
  perform set_config('shopcore.audit_source', 'complete_organization_onboarding', true);

  update public.organizations
  set
    name = v_name,
    plant_timezone = v_timezone,
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = v_actor.organization_id
  returning onboarding_completed_at into v_completed_at;

  if not found then
    raise exception 'Organization not found or access denied' using errcode = '42501';
  end if;

  insert into public.audit_log(
    organization_id, entity_type, entity_id, record_id, operation,
    actor_id, diff, source
  ) values (
    v_actor.organization_id, 'organizations', v_actor.organization_id,
    v_actor.organization_id, 'ONBOARDING_COMPLETED', v_actor.id,
    jsonb_build_object('name', v_name, 'plant_timezone', v_timezone),
    'complete_organization_onboarding'
  );

  return jsonb_build_object('completedAt', v_completed_at);
end;
$$;

create or replace function public.claim_shop_account(
  p_display_name text,
  p_organization_name text,
  p_plant_timezone text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.claim_shop_account(p_display_name, p_organization_name, p_plant_timezone);
$$;

create or replace function public.complete_my_organization_onboarding(
  p_organization_name text,
  p_plant_timezone text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.complete_my_organization_onboarding(p_organization_name, p_plant_timezone);
$$;

revoke all on function private.claim_shop_account(text, text, text) from public, anon;
revoke all on function private.complete_my_organization_onboarding(text, text) from public, anon;
revoke all on function public.claim_shop_account(text, text, text) from public, anon;
revoke all on function public.complete_my_organization_onboarding(text, text) from public, anon;
grant execute on function private.claim_shop_account(text, text, text) to authenticated;
grant execute on function private.complete_my_organization_onboarding(text, text) to authenticated;
grant execute on function public.claim_shop_account(text, text, text) to authenticated;
grant execute on function public.complete_my_organization_onboarding(text, text) to authenticated;
