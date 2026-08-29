alter table public.organizations
  add column account_claim_name text;

update public.organizations
set account_claim_name = lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'));

alter table public.organizations
  alter column account_claim_name set not null,
  add constraint organizations_account_claim_name_check check (
    length(account_claim_name) between 1 and 160
    and account_claim_name = lower(regexp_replace(btrim(account_claim_name), '[[:space:]]+', ' ', 'g'))
  );

create unique index organizations_account_claim_name_unique_idx
  on public.organizations(account_claim_name);

drop index public.organizations_account_email_domain_unique_idx;

comment on column public.organizations.account_claim_name is
  'Immutable normalized company name that uniquely claims a tenant within this ShopCore deployment.';
comment on column public.organizations.account_email_domain is
  'Normalized email domain recorded from the verified first owner for reference; it does not claim or restrict the tenant.';

create or replace function private.preserve_organization_account_claim_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.account_claim_name is null then
      new.account_claim_name := lower(regexp_replace(btrim(new.name), '[[:space:]]+', ' ', 'g'));
    end if;
  elsif new.account_claim_name is distinct from old.account_claim_name then
    raise exception 'The tenant company claim name is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger organizations_preserve_account_claim_name
before insert or update on public.organizations
for each row execute function private.preserve_organization_account_claim_name();

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
  v_organization_name text := regexp_replace(btrim(p_organization_name), '[[:space:]]+', ' ', 'g');
  v_claim_name text;
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
    raise exception 'Company name must be between 1 and 160 characters';
  end if;
  v_claim_name := lower(v_organization_name);
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception 'Choose a valid plant timezone';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_claim_name, 0));

  if exists (
    select 1 from public.organizations
    where account_claim_name = v_claim_name
  ) then
    raise exception 'A ShopCore tenant already exists for company name "%". Ask its administrator to invite you.', v_organization_name;
  end if;

  perform set_config('shopcore.audit_source', 'claim_shop_account', true);

  insert into public.organizations(
    name, account_claim_name, plant_timezone, account_email_domain
  ) values (
    v_organization_name, v_claim_name, v_timezone, v_domain
  )
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
      'account_claim_name', v_organization.account_claim_name,
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
    raise exception 'A ShopCore tenant already exists for company name "%". Ask its administrator to invite you.', v_organization_name;
end;
$$;

revoke all on function private.claim_shop_account(text, text, text) from public, anon;
grant execute on function private.claim_shop_account(text, text, text) to authenticated;
