-- Add tenant-scoped staff/customer user administration and customer email-domain enforcement.

alter table public.customers
  add column portal_email_domain text;

alter table public.customers
  add constraint customers_portal_email_domain_check check (
    portal_email_domain is null
    or (
      portal_email_domain = lower(btrim(portal_email_domain))
      and length(portal_email_domain) between 3 and 253
      and portal_email_domain like '%.%'
      and portal_email_domain !~ '[@[:space:]]|[.][.]'
      and portal_email_domain ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
    )
  );

comment on column public.customers.portal_email_domain is
  'Lowercase company email domain required for customer-portal invitations, without an @ prefix.';

alter table public.profiles
  add column email text,
  add column invited_at timestamptz,
  add column activated_at timestamptz,
  add column invited_by uuid references auth.users(id) on delete set null;

update public.profiles as profile
set
  email = lower(auth_user.email),
  activated_at = coalesce(auth_user.last_sign_in_at, auth_user.email_confirmed_at, auth_user.created_at, now())
from auth.users as auth_user
where auth_user.id = profile.id;

alter table public.profiles
  alter column email set not null,
  add constraint profiles_email_normalized_check check (
    email = lower(btrim(email))
    and length(email) between 3 and 254
    and length(email) - length(replace(email, '@', '')) = 1
    and email !~ '[[:space:]]'
  ),
  add constraint profiles_invitation_timestamps_check check (
    invited_at is null or activated_at is null or activated_at >= invited_at
  );

create unique index profiles_email_lower_idx on public.profiles(lower(email));
create index profiles_invited_by_idx on public.profiles(invited_by) where invited_by is not null;

comment on column public.profiles.email is
  'Normalized Auth email copied into the RLS-protected application profile for authorized user-management views.';
comment on column public.profiles.invited_at is
  'Timestamp when ShopCore sent this user an Auth invitation; null for accounts provisioned before invitations were added.';
comment on column public.profiles.activated_at is
  'First successful ShopCore session after invitation; existing accounts are backfilled as active.';

create table public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  email text not null,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  role public.profile_role not null,
  invited_by uuid references auth.users(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  check (
    (role = 'manufacturer' and customer_id is null)
    or (role = 'customer' and customer_id is not null)
  ),
  check (
    email = lower(btrim(email))
    and length(email) between 3 and 254
    and length(email) - length(replace(email, '@', '')) = 1
    and email !~ '[[:space:]]'
  ),
  check (not (completed_at is not null and cancelled_at is not null)),
  foreign key (customer_id, organization_id) references public.customers(id, organization_id)
);

create unique index user_invitations_pending_email_idx
  on public.user_invitations(lower(email))
  where completed_at is null and cancelled_at is null;
create index user_invitations_organization_created_idx
  on public.user_invitations(organization_id, created_at desc);
create index user_invitations_customer_created_idx
  on public.user_invitations(customer_id, created_at desc)
  where customer_id is not null;
create index user_invitations_invited_by_idx on public.user_invitations(invited_by);
create index user_invitations_user_id_idx on public.user_invitations(user_id) where user_id is not null;

alter table public.user_invitations enable row level security;
revoke all on public.user_invitations from public, anon, authenticated;

comment on table public.user_invitations is
  'Audited, server-orchestrated invitation records; normal clients use narrow RPCs and cannot mutate this table directly.';

create or replace function private.can_view_profile(
  p_organization_id uuid,
  p_customer_id uuid,
  p_role public.profile_role
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as actor
    where actor.id = (select auth.uid())
      and actor.organization_id = p_organization_id
      and (
        actor.role = 'manufacturer'
        or (
          actor.role = 'customer'
          and p_role = 'customer'
          and actor.customer_id = p_customer_id
        )
      )
  );
$$;

revoke all on function private.can_view_profile(uuid, uuid, public.profile_role) from public, anon;
grant execute on function private.can_view_profile(uuid, uuid, public.profile_role) to authenticated;

drop policy profiles_select on public.profiles;
create policy profiles_select
on public.profiles
for select
to authenticated
using ((select private.can_view_profile(organization_id, customer_id, role)));

create or replace function private.resolve_user_invitation_scope(
  p_email text,
  p_display_name text,
  p_role public.profile_role,
  p_customer_id uuid
)
returns table (
  organization_id uuid,
  customer_id uuid,
  email text,
  display_name text,
  role public.profile_role
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_customer public.customers%rowtype;
  v_email text := lower(btrim(p_email));
  v_display_name text := btrim(p_display_name);
  v_domain text;
begin
  select * into v_actor
  from public.profiles
  where id = (select auth.uid());

  if not found then
    raise exception 'Active user profile required' using errcode = '42501';
  end if;

  if length(v_email) not between 3 and 254
    or length(v_email) - length(replace(v_email, '@', '')) <> 1
    or split_part(v_email, '@', 1) = ''
    or split_part(v_email, '@', 2) = ''
    or v_email ~ '[[:space:]]'
  then
    raise exception 'Enter a valid email address';
  end if;

  if length(v_display_name) not between 1 and 120 then
    raise exception 'Enter a display name between 1 and 120 characters';
  end if;

  if exists (select 1 from public.profiles where lower(profiles.email) = v_email) then
    raise exception 'A user with this email already has ShopCore access';
  end if;

  if v_actor.role = 'manufacturer' then
    if p_role = 'manufacturer' then
      return query select v_actor.organization_id, null::uuid, v_email, v_display_name, p_role;
      return;
    end if;

    select * into v_customer
    from public.customers
    where id = p_customer_id
      and customers.organization_id = v_actor.organization_id;
  else
    if p_role <> 'customer' then
      raise exception 'Customer users may only invite customer personnel' using errcode = '42501';
    end if;

    select * into v_customer
    from public.customers
    where id = v_actor.customer_id
      and customers.organization_id = v_actor.organization_id;
  end if;

  if not found then
    raise exception 'Customer not found or access denied' using errcode = '42501';
  end if;

  if v_customer.portal_email_domain is null then
    raise exception 'Set this customer''s portal email domain before inviting users';
  end if;

  v_domain := split_part(v_email, '@', 2);
  if v_domain <> v_customer.portal_email_domain then
    raise exception 'Email must use the @% company domain', v_customer.portal_email_domain;
  end if;

  return query select v_actor.organization_id, v_customer.id, v_email, v_display_name, p_role;
end;
$$;

revoke all on function private.resolve_user_invitation_scope(text, text, public.profile_role, uuid) from public, anon;
grant execute on function private.resolve_user_invitation_scope(text, text, public.profile_role, uuid) to authenticated;

create or replace function private.create_user_invitation(
  p_email text,
  p_display_name text,
  p_role public.profile_role,
  p_customer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope record;
  v_invitation public.user_invitations%rowtype;
begin
  select * into strict v_scope
  from private.resolve_user_invitation_scope(p_email, p_display_name, p_role, p_customer_id);

  perform set_config('shopcore.audit_source', 'create_user_invitation', true);

  insert into public.user_invitations(
    organization_id,
    customer_id,
    email,
    display_name,
    role,
    invited_by
  ) values (
    v_scope.organization_id,
    v_scope.customer_id,
    v_scope.email,
    v_scope.display_name,
    v_scope.role,
    (select auth.uid())
  )
  returning * into v_invitation;

  return jsonb_build_object(
    'id', v_invitation.id,
    'email', v_invitation.email,
    'displayName', v_invitation.display_name,
    'role', v_invitation.role,
    'customerId', v_invitation.customer_id
  );
end;
$$;

create or replace function private.complete_user_invitation(
  p_invitation_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.user_invitations%rowtype;
  v_auth_email text;
begin
  select * into v_invitation
  from public.user_invitations
  where id = p_invitation_id
    and invited_by = (select auth.uid())
    and completed_at is null
    and cancelled_at is null
  for update;

  if not found then
    raise exception 'Invitation not found or access denied' using errcode = '42501';
  end if;

  select lower(email) into v_auth_email
  from auth.users
  where id = p_user_id;

  if not found or v_auth_email is distinct from v_invitation.email then
    raise exception 'Invited Auth user does not match the approved email' using errcode = '42501';
  end if;

  -- Re-evaluate scope and the current customer domain in the same transaction.
  perform * from private.resolve_user_invitation_scope(
    v_invitation.email,
    v_invitation.display_name,
    v_invitation.role,
    v_invitation.customer_id
  );

  perform set_config('shopcore.audit_source', 'complete_user_invitation', true);

  insert into public.profiles(
    id,
    organization_id,
    customer_id,
    email,
    display_name,
    role,
    invited_at,
    invited_by
  ) values (
    p_user_id,
    v_invitation.organization_id,
    v_invitation.customer_id,
    v_invitation.email,
    v_invitation.display_name,
    v_invitation.role,
    v_invitation.created_at,
    v_invitation.invited_by
  );

  update public.user_invitations
  set user_id = p_user_id, completed_at = now()
  where id = p_invitation_id;
end;
$$;

create or replace function private.cancel_user_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('shopcore.audit_source', 'cancel_user_invitation', true);

  update public.user_invitations
  set cancelled_at = now()
  where id = p_invitation_id
    and invited_by = (select auth.uid())
    and completed_at is null
    and cancelled_at is null;

  if not found then
    raise exception 'Invitation not found or access denied' using errcode = '42501';
  end if;
end;
$$;

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
    -- Serialize staff removals per organization so concurrent administrators
    -- cannot both observe another staff member and remove the final two users.
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

create or replace function private.activate_my_profile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('shopcore.audit_source', 'activate_my_profile', true);
  update public.profiles
  set activated_at = now()
  where id = (select auth.uid()) and activated_at is null;
end;
$$;

revoke all on function private.create_user_invitation(text, text, public.profile_role, uuid) from public, anon;
revoke all on function private.complete_user_invitation(uuid, uuid) from public, anon;
revoke all on function private.cancel_user_invitation(uuid) from public, anon;
revoke all on function private.remove_user_access(uuid) from public, anon;
revoke all on function private.activate_my_profile() from public, anon;
grant execute on function private.create_user_invitation(text, text, public.profile_role, uuid) to authenticated;
grant execute on function private.complete_user_invitation(uuid, uuid) to authenticated;
grant execute on function private.cancel_user_invitation(uuid) to authenticated;
grant execute on function private.remove_user_access(uuid) to authenticated;
grant execute on function private.activate_my_profile() to authenticated;

create or replace function public.create_user_invitation(
  p_email text,
  p_display_name text,
  p_role public.profile_role,
  p_customer_id uuid default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.create_user_invitation(p_email, p_display_name, p_role, p_customer_id);
$$;

create or replace function public.complete_user_invitation(p_invitation_id uuid, p_user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.complete_user_invitation(p_invitation_id, p_user_id);
$$;

create or replace function public.cancel_user_invitation(p_invitation_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_user_invitation(p_invitation_id);
$$;

create or replace function public.remove_user_access(p_user_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.remove_user_access(p_user_id);
$$;

create or replace function public.activate_my_profile()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.activate_my_profile();
$$;

revoke all on function public.create_user_invitation(text, text, public.profile_role, uuid) from public, anon;
revoke all on function public.complete_user_invitation(uuid, uuid) from public, anon;
revoke all on function public.cancel_user_invitation(uuid) from public, anon;
revoke all on function public.remove_user_access(uuid) from public, anon;
revoke all on function public.activate_my_profile() from public, anon;
grant execute on function public.create_user_invitation(text, text, public.profile_role, uuid) to authenticated;
grant execute on function public.complete_user_invitation(uuid, uuid) to authenticated;
grant execute on function public.cancel_user_invitation(uuid) to authenticated;
grant execute on function public.remove_user_access(uuid) to authenticated;
grant execute on function public.activate_my_profile() to authenticated;

-- Extend the shared audit trigger to include invitation lifecycle records.
create or replace function private.capture_erp_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_diff jsonb;
  v_organization_id uuid;
  v_entity_id uuid;
  v_record_id uuid;
  v_operation text := tg_op;
  v_request_id uuid;
  v_source text := coalesce(
    nullif(current_setting('shopcore.audit_source', true), ''),
    case when auth.uid() is null then 'database' else 'data_api' end
  );
begin
  v_old := v_old - array['created_at', 'updated_at', 'uploaded_at', 'upload_attested_at', 'creation_request_hash'];
  v_new := v_new - array['created_at', 'updated_at', 'uploaded_at', 'upload_attested_at', 'creation_request_hash'];

  if tg_op = 'UPDATE' then
    select coalesce(
      jsonb_object_agg(changed.key, jsonb_build_object('old', v_old -> changed.key, 'new', v_new -> changed.key)),
      '{}'::jsonb
    )
    into v_diff
    from (
      select key
      from jsonb_object_keys(v_old || v_new) as keys(key)
      where v_old -> key is distinct from v_new -> key
    ) as changed;

    if v_diff = '{}'::jsonb then return new; end if;
  elsif tg_op = 'INSERT' then
    v_diff := jsonb_build_object('new', v_new);
  else
    v_diff := jsonb_build_object('old', v_old);
  end if;

  if tg_table_name = 'profiles' then
    v_organization_id := coalesce(new.organization_id, old.organization_id);
    v_entity_id := v_organization_id;
    v_record_id := coalesce(new.id, old.id);
  elsif tg_table_name = 'user_invitations' then
    v_organization_id := coalesce(new.organization_id, old.organization_id);
    v_entity_id := coalesce(new.customer_id, old.customer_id, new.organization_id, old.organization_id);
    v_record_id := coalesce(new.id, old.id);
  elsif tg_table_name = 'customers' then
    v_organization_id := coalesce(new.organization_id, old.organization_id);
    v_entity_id := coalesce(new.id, old.id);
    v_record_id := v_entity_id;
  elsif tg_table_name = 'sales_orders' then
    v_organization_id := coalesce(new.organization_id, old.organization_id);
    v_entity_id := coalesce(new.id, old.id);
    v_record_id := v_entity_id;
    v_request_id := coalesce(new.creation_request_id, old.creation_request_id);
  elsif tg_table_name = 'sales_order_line_items' then
    select sales_order.organization_id into strict v_organization_id
    from public.sales_orders as sales_order
    where sales_order.id = coalesce(new.sales_order_id, old.sales_order_id);
    v_entity_id := coalesce(new.sales_order_id, old.sales_order_id);
    v_record_id := coalesce(new.id, old.id);
    v_request_id := coalesce(new.creation_request_id, old.creation_request_id);
  elsif tg_table_name = 'work_orders' then
    v_organization_id := coalesce(new.organization_id, old.organization_id);
    v_entity_id := coalesce(new.id, old.id);
    v_record_id := v_entity_id;
    v_request_id := coalesce(new.creation_request_id, old.creation_request_id);
  elsif tg_table_name = 'routing_steps' then
    select work_order.organization_id into strict v_organization_id
    from public.work_orders as work_order
    where work_order.id = coalesce(new.work_order_id, old.work_order_id);
    v_entity_id := coalesce(new.work_order_id, old.work_order_id);
    v_record_id := coalesce(new.id, old.id);
  elsif tg_table_name = 'production_events' then
    v_organization_id := coalesce(new.organization_id, old.organization_id);
    v_entity_id := coalesce(new.work_order_id, old.work_order_id);
    v_record_id := coalesce(new.id, old.id);
    v_operation := upper(coalesce(new.event_type, old.event_type));
    v_request_id := coalesce(new.request_id, old.request_id);
  elsif tg_table_name = 'customer_documents' then
    v_organization_id := coalesce(new.organization_id, old.organization_id);
    v_entity_id := coalesce(new.customer_id, old.customer_id);
    v_record_id := coalesce(new.id, old.id);
  else
    raise exception 'Unsupported audit source table: %', tg_table_name;
  end if;

  insert into public.audit_log(
    organization_id, entity_type, entity_id, record_id, operation,
    actor_id, diff, source, request_id
  ) values (
    v_organization_id, tg_table_name, v_entity_id, v_record_id, v_operation,
    auth.uid(), v_diff, v_source, v_request_id
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.capture_erp_audit() from public, anon, authenticated;

create trigger user_invitations_audit
after insert or update or delete on public.user_invitations
for each row execute function private.capture_erp_audit();
