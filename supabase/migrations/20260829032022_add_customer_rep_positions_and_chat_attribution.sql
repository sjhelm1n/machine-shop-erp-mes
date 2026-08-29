alter table public.profiles
  add column position text;

alter table public.profiles
  add constraint profiles_position_check check (
    position is null
    or (length(btrim(position)) between 1 and 120)
  );

alter table public.user_invitations
  add column position text;

alter table public.user_invitations
  add constraint user_invitations_position_check check (
    position is null
    or (length(btrim(position)) between 1 and 120)
  );

comment on column public.profiles.position is
  'Customer representative job title captured during invitation; null for plant staff and legacy customer profiles.';

comment on column public.user_invitations.position is
  'Validated customer representative job title copied into the profile when the invitation completes.';

create or replace function private.create_user_invitation(
  p_email text,
  p_display_name text,
  p_role public.profile_role,
  p_customer_id uuid,
  p_position text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope record;
  v_invitation public.user_invitations%rowtype;
  v_position text := nullif(btrim(p_position), '');
begin
  if p_role = 'customer'::public.profile_role then
    if v_position is null then
      raise exception 'Enter the customer representative''s position';
    end if;
    if length(v_position) > 120 then
      raise exception 'Position must be 120 characters or fewer';
    end if;
  else
    v_position := null;
  end if;

  select * into strict v_scope
  from private.resolve_user_invitation_scope(p_email, p_display_name, p_role, p_customer_id);

  perform set_config('shopcore.audit_source', 'create_user_invitation', true);

  insert into public.user_invitations(
    organization_id,
    customer_id,
    email,
    display_name,
    position,
    role,
    invited_by
  ) values (
    v_scope.organization_id,
    v_scope.customer_id,
    v_scope.email,
    v_scope.display_name,
    v_position,
    v_scope.role,
    (select auth.uid())
  )
  returning * into v_invitation;

  return jsonb_build_object(
    'id', v_invitation.id,
    'email', v_invitation.email,
    'displayName', v_invitation.display_name,
    'position', v_invitation.position,
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
    position,
    role,
    invited_at,
    invited_by
  ) values (
    p_user_id,
    v_invitation.organization_id,
    v_invitation.customer_id,
    v_invitation.email,
    v_invitation.display_name,
    v_invitation.position,
    v_invitation.role,
    v_invitation.created_at,
    v_invitation.invited_by
  );

  update public.user_invitations
  set user_id = p_user_id, completed_at = now()
  where id = p_invitation_id;
end;
$$;

create or replace function public.create_user_invitation(
  p_email text,
  p_display_name text,
  p_role public.profile_role,
  p_customer_id uuid,
  p_position text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.create_user_invitation(
    p_email,
    p_display_name,
    p_role,
    p_customer_id,
    p_position
  );
$$;

revoke all on function private.create_user_invitation(text, text, public.profile_role, uuid, text) from public, anon;
revoke all on function public.create_user_invitation(text, text, public.profile_role, uuid, text) from public, anon;
grant execute on function private.create_user_invitation(text, text, public.profile_role, uuid, text) to authenticated;
grant execute on function public.create_user_invitation(text, text, public.profile_role, uuid, text) to authenticated;

alter table public.customer_messages
  add column sender_display_name text;

update public.customer_messages as message
set sender_display_name = coalesce(
  (
    select profile.display_name
    from public.profiles as profile
    where profile.id = message.created_by
  ),
  case message.sender_type
    when 'manufacturer' then 'Plant team'
    else 'Customer representative'
  end
);

alter table public.customer_messages
  alter column sender_display_name set not null;

alter table public.customer_messages
  add constraint customer_messages_sender_display_name_check check (
    length(btrim(sender_display_name)) between 1 and 120
  );

create or replace function private.enforce_message_provenance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
begin
  select * into v_actor
  from public.profiles
  where id = (select auth.uid());

  if not found then
    raise exception 'Active user profile required' using errcode = '42501';
  end if;

  new.created_by := v_actor.id;
  new.sender_type := v_actor.role::text;
  new.sender_display_name := v_actor.display_name;
  new.created_at := now();
  new.read_at := null;
  return new;
end;
$$;

comment on column public.customer_messages.sender_display_name is
  'Immutable sender name captured from the authenticated profile when the message is submitted.';

-- The customer work-order RPC intentionally hides archived work orders. Return the
-- order-level completion decision separately so completed history still filters
-- correctly without exposing archived internal production records.
drop function if exists public.customer_portal_sales_orders();
drop function if exists private.customer_portal_sales_orders();

create function private.customer_portal_sales_orders()
returns table (
  id uuid,
  organization_id uuid,
  sales_order_name text,
  customer_id uuid,
  customer_name text,
  customer_po_number text,
  date_received date,
  order_due_date date,
  shipped_at timestamptz,
  invoiced_at timestamptz,
  customer_completed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    so.id,
    so.organization_id,
    so.sales_order_name,
    so.customer_id,
    so.customer_name,
    so.customer_po_number,
    so.date_received,
    so.order_due_date,
    so.shipped_at,
    so.invoiced_at,
    so.shipped_at is not null
      and so.invoiced_at is not null
      and exists (
        select 1
        from public.work_orders wo
        where wo.sales_order_id = so.id
      )
      and not exists (
        select 1
        from public.work_orders wo
        where wo.sales_order_id = so.id
          and wo.completion_date is null
      ) as customer_completed
  from public.sales_orders so
  join public.profiles p
    on p.id = (select auth.uid())
    and p.role = 'customer'
    and p.organization_id = so.organization_id
    and p.customer_id = so.customer_id
  order by so.date_received desc;
$$;

create function public.customer_portal_sales_orders()
returns table (
  id uuid,
  organization_id uuid,
  sales_order_name text,
  customer_id uuid,
  customer_name text,
  customer_po_number text,
  date_received date,
  order_due_date date,
  shipped_at timestamptz,
  invoiced_at timestamptz,
  customer_completed boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.customer_portal_sales_orders();
$$;

revoke all on function private.customer_portal_sales_orders() from public, anon;
revoke all on function public.customer_portal_sales_orders() from public, anon;
grant execute on function private.customer_portal_sales_orders() to authenticated;
grant execute on function public.customer_portal_sales_orders() to authenticated, service_role;
