insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('schland-files', 'schland-files', false, 52428800, null)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "schland files insert own path" on storage.objects;
create policy "schland files insert own path"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'schland-files'
  and public.has_permission('files.upload')
  and public.has_mfa_level2()
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "schland files download by metadata rights" on storage.objects;
create policy "schland files download by metadata rights"
on storage.objects for select
to authenticated
using (
  bucket_id = 'schland-files'
  and exists (
    select 1
    from public.files f
    where f.storage_path = name
      and public.has_permission('files.download')
      and (
        f.folder_id is null
        or public.has_folder_permission(f.folder_id, 'download')
      )
  )
);

drop policy if exists "schland files delete by metadata rights" on storage.objects;
create policy "schland files delete by metadata rights"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'schland-files'
  and public.has_mfa_level2()
  and exists (
    select 1
    from public.files f
    where f.storage_path = name
      and public.has_permission('files.delete')
      and (
        f.folder_id is null
        or public.has_folder_permission(f.folder_id, 'delete')
      )
  )
);

create or replace function public.register_uploaded_file(
  p_storage_path text,
  p_original_filename text,
  p_file_type text,
  p_file_size bigint,
  p_category_id uuid default null,
  p_folder_id uuid default null,
  p_description text default null,
  p_tags text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_id uuid := p_category_id;
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_file_id uuid;
  v_file_type text := nullif(trim(coalesce(p_file_type, '')), '');
  v_folder_category_id uuid;
  v_original_filename text := nullif(trim(coalesce(p_original_filename, '')), '');
  v_storage_filename text;
  v_storage_path text := nullif(trim(coalesce(p_storage_path, '')), '');
  v_tags text[];
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'file upload denied';
  end if;

  if not public.has_permission('files.upload') or not public.has_mfa_level2() then
    raise exception 'file upload denied';
  end if;

  if v_original_filename is null then
    raise exception 'file name is required';
  end if;

  if v_storage_path is null
    or position(v_user_id::text || '/' in v_storage_path) <> 1
    or v_storage_path like '%//%'
    or v_storage_path like '%..%'
  then
    raise exception 'storage path denied';
  end if;

  if p_file_size is null or p_file_size <= 0 then
    raise exception 'file size is required';
  end if;

  if p_file_size > 52428800 then
    raise exception 'file too large';
  end if;

  if v_file_type is null then
    v_file_type := 'application/octet-stream';
  end if;

  if v_category_id is not null and not exists (
    select 1
    from public.file_categories
    where id = v_category_id
      and active = true
  ) then
    raise exception 'category not found';
  end if;

  if p_folder_id is not null then
    select category_id
    into v_folder_category_id
    from public.folders
    where id = p_folder_id;

    if not found then
      raise exception 'folder not found';
    end if;

    if v_category_id is not null and v_category_id <> v_folder_category_id then
      raise exception 'folder category mismatch';
    end if;

    v_category_id := v_folder_category_id;

    if not public.has_folder_permission(p_folder_id, 'upload') then
      raise exception 'folder upload denied';
    end if;
  end if;

  if v_category_id is null then
    raise exception 'category is required';
  end if;

  if not exists (
    select 1
    from storage.objects so
    where so.bucket_id = 'schland-files'
      and so.name = v_storage_path
  ) then
    raise exception 'storage object not found';
  end if;

  select coalesce(array_agg(distinct cleaned_tag), '{}'::text[])
  into v_tags
  from (
    select left(trim(tag), 48) as cleaned_tag
    from unnest(coalesce(p_tags, '{}'::text[])) as tag
    where nullif(trim(tag), '') is not null
    limit 12
  ) cleaned;

  v_storage_filename := regexp_replace(v_storage_path, '^.*/', '');

  insert into public.files (
    filename,
    original_filename,
    file_type,
    file_size,
    storage_path,
    category_id,
    folder_id,
    description,
    tags,
    uploaded_by
  )
  values (
    v_storage_filename,
    v_original_filename,
    v_file_type,
    p_file_size,
    v_storage_path,
    v_category_id,
    p_folder_id,
    v_description,
    v_tags,
    v_user_id
  )
  returning id into v_file_id;

  insert into public.systemprotokoll (benutzer_id, aktion, bereich, details)
  values (
    v_user_id,
    'file_uploaded',
    'files',
    concat('file=', v_file_id::text, '; name=', v_original_filename)
  );

  return v_file_id;
end;
$$;

revoke all on function public.register_uploaded_file(
  text,
  text,
  text,
  bigint,
  uuid,
  uuid,
  text,
  text[]
) from public;
revoke all on function public.register_uploaded_file(
  text,
  text,
  text,
  bigint,
  uuid,
  uuid,
  text,
  text[]
) from anon;
grant execute on function public.register_uploaded_file(
  text,
  text,
  text,
  bigint,
  uuid,
  uuid,
  text,
  text[]
) to authenticated;
