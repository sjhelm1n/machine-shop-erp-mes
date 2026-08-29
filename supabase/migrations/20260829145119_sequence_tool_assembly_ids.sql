-- Tool Assemblies follow the same identity pattern as Sales and Work Orders:
-- an immutable UUID for relationships plus an organization-scoped generated ID
-- for people. Existing IDs remain unchanged.

comment on column public.tool_assemblies.assembly_number is
  'Organization-scoped chronological Tool Assembly ID generated when the assembly is inserted.';

comment on column public.tool_assemblies.description is
  'User-entered Tool Assembly name; defaults to assembly_number when omitted.';

create or replace function private.assign_tool_assembly_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_number bigint;
  v_number_text text;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(
      hashtextextended('tool_assembly_number:' || new.organization_id::text, 0)
    );

    select coalesce(max(
      case
        when assembly_number ~ '^TA-[0-9]+$'
          then substring(assembly_number from 4)::bigint
        else null
      end
    ), 0) + 1
    into v_next_number
    from public.tool_assemblies
    where organization_id = new.organization_id;

    v_number_text := v_next_number::text;
    new.assembly_number := 'TA-' || case
      when length(v_number_text) < 3 then lpad(v_number_text, 3, '0')
      else v_number_text
    end;
  else
    -- A Tool Assembly ID is a stable document identifier, not an editable label.
    new.assembly_number := old.assembly_number;
  end if;

  new.description := coalesce(
    nullif(btrim(new.description), ''),
    new.assembly_number
  );

  return new;
end;
$$;

revoke all on function private.assign_tool_assembly_identity()
from public, anon, authenticated;

create trigger tool_assembly_identity
before insert or update on public.tool_assemblies
for each row
execute function private.assign_tool_assembly_identity();

create or replace function public.save_tool_assembly(
  p_tool_assembly_id uuid, p_organization_id uuid, p_assembly_number text,
  p_description text, p_quantity_owned integer, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(p_tool_assembly_id, gen_random_uuid());
  v_checked_out integer;
  v_existing_organization_id uuid;
begin
  if not (select private.is_manufacturer(p_organization_id)) then
    raise exception using errcode = 'P0001', message = 'Tool assembly not found or access denied';
  end if;
  if length(btrim(coalesce(p_description, ''))) > 240 then raise exception 'Tool Assembly name must be 240 characters or fewer'; end if;
  if p_quantity_owned is null or p_quantity_owned < 0 then raise exception 'Quantity owned cannot be negative'; end if;

  select organization_id
    into v_existing_organization_id
  from public.tool_assemblies
  where id = v_id
  for update;

  if found and v_existing_organization_id <> p_organization_id then
    raise exception using errcode = 'P0001', message = 'Tool assembly not found or access denied';
  end if;

  select coalesce(sum(case when transaction_type = 'CHECK_OUT' then quantity else -quantity end), 0)::integer
    into v_checked_out
  from public.tool_checkout_transactions
  where tool_assembly_id = v_id;

  if p_quantity_owned < v_checked_out then raise exception 'Quantity owned cannot be less than quantity currently checked out'; end if;

  perform set_config('shopcore.audit_source', 'save_tool_assembly', true);

  if v_existing_organization_id is null then
    -- assembly_number is intentionally omitted; the identity trigger owns it.
    insert into public.tool_assemblies(
      id, organization_id, description, quantity_owned, notes
    ) values (
      v_id, p_organization_id, coalesce(p_description, ''),
      p_quantity_owned, coalesce(p_notes, '')
    );
  else
    update public.tool_assemblies
    set description = coalesce(p_description, ''),
        quantity_owned = p_quantity_owned,
        notes = coalesce(p_notes, '')
    where id = v_id and organization_id = p_organization_id;
  end if;

  return v_id;
end;
$$;

comment on function public.save_tool_assembly(uuid, uuid, text, text, integer, text) is
  'Creates or edits a Tool Assembly. p_assembly_number is retained for RPC compatibility; PostgreSQL generates and preserves the Tool Assembly ID.';
