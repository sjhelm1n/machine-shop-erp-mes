-- Earlier onboarding only backfilled business domains. Reserve personal-provider
-- domains too when exactly one existing organization has that owner domain.
with owner_domains as (
  select
    profile.organization_id,
    lower(split_part(profile.email, '@', 2)) as domain
  from public.profiles as profile
  where profile.is_super_admin
), unique_owner_domains as (
  select organization_id, domain
  from owner_domains
  where domain like '%.%'
    and domain !~ '[^a-z0-9.-]'
    and domain not like '.%'
    and domain not like '%.'
    and domain not like '%..%'
    and (select count(*) from owner_domains duplicate where duplicate.domain = owner_domains.domain) = 1
    and not exists (
      select 1 from public.organizations claimed
      where claimed.account_email_domain = owner_domains.domain
    )
)
update public.organizations as organization
set account_email_domain = owner.domain
from unique_owner_domains as owner
where owner.organization_id = organization.id
  and organization.account_email_domain is null;

comment on column public.organizations.account_email_domain is
  'Normalized, deployment-local email domain allowed to claim this organization during self-service setup. Personal providers are allowed.';

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
    raise exception 'A valid email address is required';
  end if;

  v_domain := split_part(v_email, '@', 2);
  if length(v_domain) not between 3 and 253
    or v_domain not like '%.%'
    or v_domain ~ '[^a-z0-9.-]'
    or v_domain like '.%'
    or v_domain like '%.'
    or v_domain like '%..%'
  then
    raise exception 'A valid email domain is required';
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

revoke all on function private.claim_shop_account(text, text, text) from public, anon;
grant execute on function private.claim_shop_account(text, text, text) to authenticated;
