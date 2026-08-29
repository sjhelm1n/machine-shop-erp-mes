alter table public.tool_assemblies
  add column image_path text,
  add constraint tool_assemblies_image_path_scope_check check (
    image_path is null or (
      split_part(image_path, '/', 1) = organization_id::text
      and split_part(image_path, '/', 2) = id::text
      and split_part(image_path, '/', 3) <> ''
      and split_part(image_path, '/', 4) = ''
      and lower(split_part(image_path, '.', -1)) in ('jpg', 'jpeg', 'png', 'webp')
    )
  );

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'tool-assembly-images', 'tool-assembly-images', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy tool_assembly_images_select
on storage.objects for select to authenticated using (
  bucket_id = 'tool-assembly-images'
  and exists (
    select 1 from public.tool_assemblies assembly
    where assembly.image_path = name
      and (select private.is_manufacturer(assembly.organization_id))
  )
);

create policy tool_assembly_images_insert
on storage.objects for insert to authenticated with check (
  bucket_id = 'tool-assembly-images'
  and array_length(storage.foldername(name), 1) = 2
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and coalesce(metadata ->> 'mimetype', '') in ('image/jpeg', 'image/png', 'image/webp')
  and exists (
    select 1 from public.tool_assemblies assembly
    where assembly.organization_id::text = (storage.foldername(name))[1]
      and assembly.id::text = (storage.foldername(name))[2]
      and (select private.is_manufacturer(assembly.organization_id))
  )
);

create policy tool_assembly_images_delete
on storage.objects for delete to authenticated using (
  bucket_id = 'tool-assembly-images'
  and array_length(storage.foldername(name), 1) = 2
  and exists (
    select 1 from public.tool_assemblies assembly
    where assembly.organization_id::text = (storage.foldername(name))[1]
      and assembly.id::text = (storage.foldername(name))[2]
      and (select private.is_manufacturer(assembly.organization_id))
  )
);

create or replace function private.set_tool_assembly_image(p_tool_assembly_id uuid, p_image_path text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_tool public.tool_assemblies%rowtype; v_old_path text;
begin
  select * into v_tool from public.tool_assemblies where id = p_tool_assembly_id for update;
  if not found or not (select private.is_manufacturer(v_tool.organization_id)) then
    raise exception using errcode = 'P0001', message = 'Tool assembly not found or access denied';
  end if;
  if p_image_path is not null and (
    split_part(p_image_path, '/', 1) <> v_tool.organization_id::text
    or split_part(p_image_path, '/', 2) <> v_tool.id::text
    or split_part(p_image_path, '/', 3) = ''
    or split_part(p_image_path, '/', 4) <> ''
    or lower(split_part(p_image_path, '.', -1)) not in ('jpg', 'jpeg', 'png', 'webp')
  ) then raise exception 'Tool assembly image path is invalid'; end if;
  v_old_path := v_tool.image_path;
  perform set_config('shopcore.audit_source', 'set_tool_assembly_image', true);
  update public.tool_assemblies set image_path = p_image_path where id = p_tool_assembly_id;
  return v_old_path;
end;
$$;

create or replace function public.set_tool_assembly_image(p_tool_assembly_id uuid, p_image_path text)
returns text language sql security invoker set search_path = '' as $$
  select private.set_tool_assembly_image(p_tool_assembly_id, p_image_path);
$$;

revoke all on function private.set_tool_assembly_image(uuid, text) from public, anon;
revoke all on function public.set_tool_assembly_image(uuid, text) from public, anon;
grant execute on function private.set_tool_assembly_image(uuid, text) to authenticated;
grant execute on function public.set_tool_assembly_image(uuid, text) to authenticated;
