create table public.production_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_name text not null check (length(btrim(device_name)) between 1 and 120),
  credential_hash text not null unique check (length(credential_hash) = 64),
  network_hash text not null check (length(network_hash) = 64),
  pending_network_hash text check (pending_network_hash is null or length(pending_network_hash) = 64),
  assigned_operator_id uuid references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at)
);

create index production_devices_organization_active_idx
  on public.production_devices(organization_id, expires_at)
  where revoked_at is null;

create table public.production_operator_codes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code_salt text not null,
  code_hash text not null,
  set_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  check (length(code_salt) >= 16),
  check (length(code_hash) >= 32)
);

create index production_operator_codes_organization_active_idx
  on public.production_operator_codes(organization_id, profile_id)
  where disabled_at is null;

create table public.production_device_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null references public.production_devices(id) on delete cascade,
  operator_id uuid not null references public.profiles(id) on delete cascade,
  session_hash text not null unique check (length(session_hash) = 64),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (expires_at > created_at)
);

create index production_device_sessions_device_active_idx
  on public.production_device_sessions(device_id, expires_at)
  where revoked_at is null;

alter table public.production_events
  add column production_device_id uuid references public.production_devices(id) on delete restrict;

create index production_events_device_created_idx
  on public.production_events(production_device_id, created_at desc)
  where production_device_id is not null;

alter table public.production_devices enable row level security;
alter table public.production_operator_codes enable row level security;
alter table public.production_device_sessions enable row level security;

revoke all on public.production_devices from public, anon, authenticated;
revoke all on public.production_operator_codes from public, anon, authenticated;
revoke all on public.production_device_sessions from public, anon, authenticated;
grant all on public.production_devices to service_role;
grant all on public.production_operator_codes to service_role;
grant all on public.production_device_sessions to service_role;

comment on table public.production_devices is
  'Server-managed production-only device registrations. A QR scan creates a pending random Device ID; a super admin assigns and approves it for one operator and the observed network.';
comment on table public.production_operator_codes is
  'Server-managed salted hashes for six-digit production operator codes; plaintext codes are never stored.';
comment on table public.production_device_sessions is
  'Short-lived production-only operator sessions bound to an enrolled device.';
comment on column public.production_events.production_device_id is
  'Enrolled production device used for a code-authorized shop-floor event; null for normal ERP sessions.';

create or replace function private.enforce_station_production_provenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := nullif(current_setting('shopcore.production_actor_id', true), '')::uuid;
  v_device_id uuid := nullif(current_setting('shopcore.production_device_id', true), '')::uuid;
begin
  if v_actor_id is null and v_device_id is null then
    return new;
  end if;
  if v_actor_id is null or v_device_id is null then
    raise exception 'Incomplete production device provenance' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = v_actor_id
      and organization_id = new.organization_id
      and role = 'manufacturer'::public.profile_role
      and activated_at is not null
  ) then
    raise exception 'Production operator not found or access denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.production_devices
    where id = v_device_id
      and organization_id = new.organization_id
      and assigned_operator_id = v_actor_id
      and approved_at is not null
      and revoked_at is null
      and expires_at > now()
  ) then
    raise exception 'Production device not found or access denied' using errcode = '42501';
  end if;
  new.actor_id := v_actor_id;
  new.production_device_id := v_device_id;
  return new;
end;
$$;

create trigger production_events_station_provenance
before insert on public.production_events
for each row execute function private.enforce_station_production_provenance();

create or replace function private.correct_station_production_audit_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.production_device_id is not null then
    update public.audit_log
    set actor_id = new.actor_id
    where entity_type = 'production_events'
      and record_id = new.id
      and actor_id is null;
  end if;
  return new;
end;
$$;

create trigger zz_production_events_station_audit_actor
after insert on public.production_events
for each row execute function private.correct_station_production_audit_actor();

create or replace function private.assert_station_access(
  p_organization_id uuid,
  p_operator_id uuid,
  p_device_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = p_operator_id
      and organization_id = p_organization_id
      and role = 'manufacturer'::public.profile_role
      and activated_at is not null
  ) then
    raise exception 'Production operator not found or access denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.production_devices
    where id = p_device_id
      and organization_id = p_organization_id
      and assigned_operator_id = p_operator_id
      and approved_at is not null
      and revoked_at is null
      and expires_at > now()
  ) then
    raise exception 'Production device not found or access denied' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.record_station_production_event(
  p_organization_id uuid,
  p_operator_id uuid,
  p_device_id uuid,
  p_work_order_id uuid,
  p_routing_step_id uuid,
  p_event_type text,
  p_quantity integer,
  p_to_routing_step_id uuid,
  p_request_id uuid
)
returns public.production_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.production_events;
  v_expected_from uuid := case when p_event_type = 'transfer' then p_routing_step_id else null end;
  v_expected_to uuid := case when p_event_type = 'transfer' then p_to_routing_step_id else null end;
begin
  perform private.assert_station_access(p_organization_id, p_operator_id, p_device_id);
  if p_request_id is null then
    raise exception 'A production request id is required' using errcode = '22023';
  end if;
  if p_event_type not in ('transfer', 'scrap') then
    raise exception 'Unsupported production event type' using errcode = '22023';
  end if;
  if p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.work_orders
    where id = p_work_order_id and organization_id = p_organization_id
  ) then
    raise exception 'Work order not found or access denied' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('production_request:' || p_request_id::text, 0));
  select * into v_event
  from public.production_events
  where organization_id = p_organization_id and request_id = p_request_id;
  if found then
    if v_event.actor_id is distinct from p_operator_id
      or v_event.production_device_id is distinct from p_device_id
      or v_event.work_order_id is distinct from p_work_order_id
      or v_event.routing_step_id is distinct from p_routing_step_id
      or v_event.event_type is distinct from p_event_type
      or v_event.quantity is distinct from p_quantity
      or v_event.from_routing_step_id is distinct from v_expected_from
      or v_event.to_routing_step_id is distinct from v_expected_to then
      raise exception 'Production request id was already used for a different transaction' using errcode = '22023';
    end if;
    return v_event;
  end if;

  perform set_config('shopcore.production_actor_id', p_operator_id::text, true);
  perform set_config('shopcore.production_device_id', p_device_id::text, true);
  perform set_config('shopcore.audit_source', 'production_device', true);
  insert into public.production_events(
    organization_id, work_order_id, routing_step_id, event_type, quantity,
    from_routing_step_id, to_routing_step_id, request_id, production_device_id
  ) values (
    p_organization_id, p_work_order_id, p_routing_step_id, p_event_type, p_quantity,
    v_expected_from, v_expected_to, p_request_id, p_device_id
  ) returning * into v_event;
  return v_event;
end;
$$;

create or replace function public.record_station_production_event(
  p_organization_id uuid,
  p_operator_id uuid,
  p_device_id uuid,
  p_work_order_id uuid,
  p_routing_step_id uuid,
  p_event_type text,
  p_quantity integer,
  p_to_routing_step_id uuid,
  p_request_id uuid
)
returns public.production_events
language sql
security invoker
set search_path = ''
as $$
  select private.record_station_production_event(
    p_organization_id, p_operator_id, p_device_id, p_work_order_id,
    p_routing_step_id, p_event_type, p_quantity, p_to_routing_step_id, p_request_id
  );
$$;

create or replace function private.station_production_step_snapshot(
  p_organization_id uuid,
  p_operator_id uuid,
  p_device_id uuid,
  p_work_order_id uuid,
  p_routing_step_id uuid
)
returns table (
  work_order_id uuid,
  work_order_name text,
  part_number text,
  archived_at timestamptz,
  step_id uuid,
  sequence_number integer,
  routing_step_name text,
  available integer,
  transferred integer,
  scrapped integer,
  next_step_id uuid,
  next_step_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_station_access(p_organization_id, p_operator_id, p_device_id);
  return query
  with active_events as (
    select event.*
    from public.production_events as event
    where event.work_order_id = p_work_order_id
      and event.organization_id = p_organization_id
      and event.event_type <> 'reversal'
      and not exists (
        select 1 from public.production_events as reversal
        where reversal.reversed_event_id = event.id
      )
  ), step_totals as (
    select
      coalesce(sum(event.quantity) filter (
        where (event.event_type in ('release', 'adjustment') and event.routing_step_id = p_routing_step_id)
           or (event.event_type = 'transfer' and event.to_routing_step_id = p_routing_step_id)
      ), 0)::integer as entered,
      coalesce(sum(event.quantity) filter (
        where event.event_type = 'transfer' and event.from_routing_step_id = p_routing_step_id
      ), 0)::integer as transferred,
      coalesce(sum(event.quantity) filter (
        where event.event_type = 'scrap' and event.routing_step_id = p_routing_step_id
      ), 0)::integer as scrapped
    from active_events as event
  )
  select
    work_order.id, work_order.work_order_name, work_order.part_number,
    work_order.archived_at, step.id, step.sequence_number,
    step.routing_step_name,
    totals.entered - totals.transferred - totals.scrapped,
    totals.transferred, totals.scrapped,
    next_step.id, next_step.routing_step_name
  from public.work_orders as work_order
  join public.routing_steps as step
    on step.id = p_routing_step_id and step.work_order_id = work_order.id
  cross join step_totals as totals
  left join lateral (
    select candidate.id, candidate.routing_step_name
    from public.routing_steps as candidate
    where candidate.work_order_id = work_order.id
      and candidate.sequence_number > step.sequence_number
    order by candidate.sequence_number
    limit 1
  ) as next_step on true
  where work_order.id = p_work_order_id
    and work_order.organization_id = p_organization_id;
end;
$$;

create or replace function public.station_production_step_snapshot(
  p_organization_id uuid,
  p_operator_id uuid,
  p_device_id uuid,
  p_work_order_id uuid,
  p_routing_step_id uuid
)
returns table (
  work_order_id uuid,
  work_order_name text,
  part_number text,
  archived_at timestamptz,
  step_id uuid,
  sequence_number integer,
  routing_step_name text,
  available integer,
  transferred integer,
  scrapped integer,
  next_step_id uuid,
  next_step_name text
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.station_production_step_snapshot(
    p_organization_id, p_operator_id, p_device_id, p_work_order_id, p_routing_step_id
  );
$$;

create or replace function private.reverse_station_production_event(
  p_organization_id uuid,
  p_operator_id uuid,
  p_device_id uuid,
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.production_events%rowtype;
begin
  perform private.assert_station_access(p_organization_id, p_operator_id, p_device_id);
  select * into v_original from public.production_events
  where id = p_event_id and organization_id = p_organization_id;
  if not found then
    raise exception 'Production event not found or access denied' using errcode = '42501';
  end if;
  if v_original.actor_id is distinct from p_operator_id
    or v_original.production_device_id is distinct from p_device_id then
    raise exception 'Only the operator on this device can undo this transaction' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_original.work_order_id::text, 0));
  if exists (select 1 from public.production_events where reversed_event_id = v_original.id) then
    return;
  end if;
  if v_original.created_at < now() - interval '5 minutes' then
    raise exception 'The undo window for this transaction has expired';
  end if;
  perform set_config('shopcore.production_actor_id', p_operator_id::text, true);
  perform set_config('shopcore.production_device_id', p_device_id::text, true);
  perform set_config('shopcore.audit_source', 'production_device', true);
  insert into public.production_events(
    organization_id, work_order_id, routing_step_id, event_type,
    quantity, reversed_event_id, production_device_id
  ) values (
    p_organization_id, v_original.work_order_id, v_original.routing_step_id,
    'reversal', v_original.quantity, v_original.id, p_device_id
  );
end;
$$;

create or replace function public.reverse_station_production_event(
  p_organization_id uuid,
  p_operator_id uuid,
  p_device_id uuid,
  p_event_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.reverse_station_production_event(
    p_organization_id, p_operator_id, p_device_id, p_event_id
  );
$$;

revoke all on function private.enforce_station_production_provenance() from public, anon, authenticated;
revoke all on function private.correct_station_production_audit_actor() from public, anon, authenticated;
revoke all on function private.assert_station_access(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.record_station_production_event(uuid, uuid, uuid, uuid, uuid, text, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function private.station_production_step_snapshot(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.reverse_station_production_event(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_station_production_event(uuid, uuid, uuid, uuid, uuid, text, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.station_production_step_snapshot(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.reverse_station_production_event(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.record_station_production_event(uuid, uuid, uuid, uuid, uuid, text, integer, uuid, uuid) to service_role;
grant execute on function private.station_production_step_snapshot(uuid, uuid, uuid, uuid, uuid) to service_role;
grant execute on function private.reverse_station_production_event(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.record_station_production_event(uuid, uuid, uuid, uuid, uuid, text, integer, uuid, uuid) to service_role;
grant execute on function public.station_production_step_snapshot(uuid, uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.reverse_station_production_event(uuid, uuid, uuid, uuid) to service_role;

create or replace function public.manage_production_device(
  p_admin_id uuid,
  p_device_id uuid,
  p_action text,
  p_operator_id uuid default null
)
returns public.production_devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin public.profiles%rowtype;
  v_device public.production_devices%rowtype;
  v_before jsonb;
begin
  select * into v_admin from public.profiles where id = p_admin_id;
  if not found or v_admin.role <> 'manufacturer'::public.profile_role
    or not v_admin.is_super_admin or v_admin.activated_at is null then
    raise exception 'Super admin access is required' using errcode = '42501';
  end if;

  select * into v_device from public.production_devices
  where id = p_device_id and organization_id = v_admin.organization_id
  for update;
  if not found then
    raise exception 'Production device not found or access denied' using errcode = '42501';
  end if;
  v_before := to_jsonb(v_device) - array['credential_hash', 'network_hash', 'pending_network_hash'];

  if p_action = 'approve' then
    if p_operator_id is null or not exists (
      select 1 from public.profiles
      where id = p_operator_id
        and organization_id = v_admin.organization_id
        and role = 'manufacturer'::public.profile_role
        and activated_at is not null
    ) then
      raise exception 'Choose an active plant operator' using errcode = '22023';
    end if;
    update public.production_devices
    set assigned_operator_id = p_operator_id,
        approved_by = p_admin_id,
        approved_at = now(),
        network_hash = coalesce(pending_network_hash, network_hash),
        pending_network_hash = null,
        revoked_at = null,
        failed_attempts = 0,
        locked_until = null
    where id = p_device_id returning * into v_device;
  elsif p_action = 'approve_network' then
    if v_device.pending_network_hash is null then
      raise exception 'This device has no pending network change' using errcode = '22023';
    end if;
    update public.production_devices
    set network_hash = pending_network_hash,
        pending_network_hash = null,
        failed_attempts = 0,
        locked_until = null
    where id = p_device_id returning * into v_device;
  elsif p_action = 'revoke' then
    update public.production_devices
    set revoked_at = now() where id = p_device_id returning * into v_device;
    update public.production_device_sessions
    set revoked_at = now()
    where device_id = p_device_id and revoked_at is null;
  else
    raise exception 'Unsupported production-device action' using errcode = '22023';
  end if;

  insert into public.audit_log(
    organization_id, entity_type, entity_id, record_id, operation,
    actor_id, diff, source
  ) values (
    v_admin.organization_id, 'production_devices', v_device.id, v_device.id,
    upper(p_action), p_admin_id,
    jsonb_build_object(
      'before', v_before,
      'after', to_jsonb(v_device) - array['credential_hash', 'network_hash', 'pending_network_hash']
    ),
    'manage_production_device'
  );
  return v_device;
end;
$$;

create or replace function public.reset_production_operator_code(
  p_admin_id uuid,
  p_operator_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id
  from public.profiles
  where id = p_admin_id
    and role = 'manufacturer'::public.profile_role
    and is_super_admin
    and activated_at is not null;
  if not found then
    raise exception 'Super admin access is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_operator_id and organization_id = v_organization_id
      and role = 'manufacturer'::public.profile_role and activated_at is not null
  ) then
    raise exception 'Production operator not found or access denied' using errcode = '42501';
  end if;
  delete from public.production_operator_codes
  where profile_id = p_operator_id and organization_id = v_organization_id;
  update public.production_device_sessions set revoked_at = now()
  where operator_id = p_operator_id and organization_id = v_organization_id and revoked_at is null;
  insert into public.audit_log(
    organization_id, entity_type, entity_id, record_id, operation,
    actor_id, diff, source
  ) values (
    v_organization_id, 'production_operator_codes', p_operator_id, p_operator_id,
    'RESET', p_admin_id, '{}'::jsonb, 'reset_production_operator_code'
  );
end;
$$;

create or replace function public.set_production_operator_code(
  p_operator_id uuid,
  p_device_id uuid,
  p_code_salt text,
  p_code_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id
  from public.production_devices
  where id = p_device_id
    and assigned_operator_id = p_operator_id
    and approved_at is not null
    and revoked_at is null
    and expires_at > now();
  if not found then
    raise exception 'Production device not found or access denied' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.production_operator_codes
    where profile_id = p_operator_id and disabled_at is null
  ) then
    raise exception 'This operator already has a PIN. A super admin must reset it first.' using errcode = '23505';
  end if;
  insert into public.production_operator_codes(
    profile_id, organization_id, code_salt, code_hash, set_by
  ) values (
    p_operator_id, v_organization_id, p_code_salt, p_code_hash, p_operator_id
  )
  on conflict (profile_id) do update
  set organization_id = excluded.organization_id,
      code_salt = excluded.code_salt,
      code_hash = excluded.code_hash,
      set_by = excluded.set_by,
      updated_at = now(),
      disabled_at = null;
  insert into public.audit_log(
    organization_id, entity_type, entity_id, record_id, operation,
    actor_id, diff, source
  ) values (
    v_organization_id, 'production_operator_codes', p_operator_id, p_operator_id,
    'SET', p_operator_id, '{}'::jsonb, 'set_production_operator_code'
  );
end;
$$;

revoke all on function public.manage_production_device(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.reset_production_operator_code(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_production_operator_code(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.manage_production_device(uuid, uuid, text, uuid) to service_role;
grant execute on function public.reset_production_operator_code(uuid, uuid) to service_role;
grant execute on function public.set_production_operator_code(uuid, uuid, text, text) to service_role;
