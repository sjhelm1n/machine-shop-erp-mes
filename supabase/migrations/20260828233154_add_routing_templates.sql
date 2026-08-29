-- Reusable, organization-scoped routing definitions. Work-order routing steps
-- remain independent snapshots; templates are never referenced by production.

create table public.routing_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  template_name text not null check (length(btrim(template_name)) between 1 and 120),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, template_name)
);

create table public.routing_template_steps (
  id uuid primary key default gen_random_uuid(),
  routing_template_id uuid not null references public.routing_templates(id) on delete cascade,
  sequence_number integer not null check (sequence_number > 0),
  routing_step_name text not null check (length(btrim(routing_step_name)) between 1 and 120),
  customer_stage_name text not null check (length(btrim(customer_stage_name)) between 1 and 120),
  work_instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (routing_template_id, sequence_number)
);

create index routing_templates_organization_active_name_idx
  on public.routing_templates(organization_id, archived_at, template_name);
create index routing_template_steps_template_sequence_idx
  on public.routing_template_steps(routing_template_id, sequence_number);

comment on table public.routing_templates is
  'Reusable routing definitions for future work orders. Released work orders contain independent routing-step snapshots.';
comment on table public.routing_template_steps is
  'Ordered internal operation, customer stage, and work-instruction rows belonging to a routing template.';

create trigger routing_templates_updated_at
before update on public.routing_templates
for each row execute function private.set_updated_at();

create trigger routing_template_steps_updated_at
before update on public.routing_template_steps
for each row execute function private.set_updated_at();

alter table public.routing_templates enable row level security;
alter table public.routing_template_steps enable row level security;

revoke all on public.routing_templates, public.routing_template_steps from public, anon, authenticated;
grant select on public.routing_templates, public.routing_template_steps to authenticated;

create policy routing_templates_select
on public.routing_templates
for select
to authenticated
using ((select private.is_manufacturer(organization_id)));

create policy routing_template_steps_select
on public.routing_template_steps
for select
to authenticated
using (
  exists (
    select 1
    from public.routing_templates as template
    where template.id = routing_template_id
      and (select private.is_manufacturer(template.organization_id))
  )
);

create or replace function private.capture_routing_template_audit()
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
  v_source text := coalesce(
    nullif(current_setting('shopcore.audit_source', true), ''),
    case when auth.uid() is null then 'database' else 'data_api' end
  );
begin
  v_old := v_old - array['created_at', 'updated_at'];
  v_new := v_new - array['created_at', 'updated_at'];

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

    if v_diff = '{}'::jsonb then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    v_diff := jsonb_build_object('new', v_new);
  else
    v_diff := jsonb_build_object('old', v_old);
  end if;

  if tg_table_name = 'routing_templates' then
    v_organization_id := coalesce(new.organization_id, old.organization_id);
    v_entity_id := coalesce(new.id, old.id);
    v_record_id := v_entity_id;
  else
    select template.organization_id
      into strict v_organization_id
    from public.routing_templates as template
    where template.id = coalesce(new.routing_template_id, old.routing_template_id);
    v_entity_id := coalesce(new.routing_template_id, old.routing_template_id);
    v_record_id := coalesce(new.id, old.id);
  end if;

  insert into public.audit_log(
    organization_id, entity_type, entity_id, record_id, operation,
    actor_id, diff, source
  ) values (
    v_organization_id, tg_table_name, v_entity_id, v_record_id, tg_op,
    auth.uid(), v_diff, v_source
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.capture_routing_template_audit() from public, anon, authenticated;

create trigger routing_templates_audit
after insert or update or delete on public.routing_templates
for each row execute function private.capture_routing_template_audit();

create trigger routing_template_steps_audit
after insert or update or delete on public.routing_template_steps
for each row execute function private.capture_routing_template_audit();

create or replace function private.save_routing_template(
  p_template_id uuid,
  p_organization_id uuid,
  p_template_name text,
  p_steps jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_organization_id uuid;
  v_template_exists boolean;
  v_template_name text := btrim(p_template_name);
  v_step jsonb;
  v_index integer := 0;
begin
  if p_template_id is null then
    raise exception 'A template id is required';
  end if;
  if not (select private.is_manufacturer(p_organization_id)) then
    raise exception using errcode = 'P0001', message = 'Organization not found or access denied';
  end if;
  if length(v_template_name) not between 1 and 120 then
    raise exception 'Template name must be between 1 and 120 characters';
  end if;
  if jsonb_typeof(p_steps) <> 'array'
     or jsonb_array_length(p_steps) not between 1 and 50 then
    raise exception 'A routing template requires between 1 and 50 steps';
  end if;

  select organization_id
    into v_existing_organization_id
  from public.routing_templates
  where id = p_template_id
  for update;
  v_template_exists := found;

  if v_template_exists and v_existing_organization_id <> p_organization_id then
    raise exception using errcode = 'P0001', message = 'Routing template not found or access denied';
  end if;

  perform set_config('shopcore.audit_source', 'save_routing_template', true);

  if v_template_exists then
    update public.routing_templates
    set template_name = v_template_name
    where id = p_template_id;

    delete from public.routing_template_steps
    where routing_template_id = p_template_id;
  else
    insert into public.routing_templates(id, organization_id, template_name)
    values (p_template_id, p_organization_id, v_template_name);
  end if;

  for v_step in
    select value from jsonb_array_elements(p_steps)
  loop
    v_index := v_index + 1;
    if jsonb_typeof(v_step) <> 'object'
       or length(btrim(coalesce(v_step ->> 'routing_step_name', ''))) not between 1 and 120
       or length(btrim(coalesce(v_step ->> 'customer_stage_name', ''))) not between 1 and 120 then
      raise exception 'Every routing step requires an internal step and customer stage of 1 to 120 characters';
    end if;

    insert into public.routing_template_steps(
      routing_template_id,
      sequence_number,
      routing_step_name,
      customer_stage_name,
      work_instructions
    ) values (
      p_template_id,
      v_index * 10,
      btrim(v_step ->> 'routing_step_name'),
      btrim(v_step ->> 'customer_stage_name'),
      coalesce(v_step ->> 'work_instructions', '')
    );
  end loop;

  return p_template_id;
end;
$$;

create or replace function public.save_routing_template(
  p_template_id uuid,
  p_organization_id uuid,
  p_template_name text,
  p_steps jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.save_routing_template(p_template_id, p_organization_id, p_template_name, p_steps);
$$;

create or replace function private.set_routing_template_archived(
  p_template_id uuid,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select organization_id
    into v_organization_id
  from public.routing_templates
  where id = p_template_id
  for update;

  if not found or not (select private.is_manufacturer(v_organization_id)) then
    raise exception using errcode = 'P0001', message = 'Routing template not found or access denied';
  end if;

  perform set_config('shopcore.audit_source', 'set_routing_template_archived', true);
  update public.routing_templates
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
  where id = p_template_id;
end;
$$;

create or replace function public.set_routing_template_archived(
  p_template_id uuid,
  p_archived boolean
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_routing_template_archived(p_template_id, p_archived);
$$;

revoke all on function private.save_routing_template(uuid, uuid, text, jsonb) from public, anon;
revoke all on function private.set_routing_template_archived(uuid, boolean) from public, anon;
revoke all on function public.save_routing_template(uuid, uuid, text, jsonb) from public, anon;
revoke all on function public.set_routing_template_archived(uuid, boolean) from public, anon;

grant execute on function private.save_routing_template(uuid, uuid, text, jsonb) to authenticated;
grant execute on function private.set_routing_template_archived(uuid, boolean) to authenticated;
grant execute on function public.save_routing_template(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.set_routing_template_archived(uuid, boolean) to authenticated;
