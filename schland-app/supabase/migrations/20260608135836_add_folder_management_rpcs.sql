create or replace function public.has_folder_permission(
  p_folder_id uuid,
  p_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_folder_id is null then
    return false;
  end if;

  if public.has_permission('folders.manage') then
    return true;
  end if;

  return exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    join public.roles r on r.id = ur.role_id
    join public.folder_permissions fp on fp.role_id = r.id
    where p.id = auth.uid()
      and p.status = 'active'
      and r.active = true
      and fp.folder_id = p_folder_id
      and case p_permission
        when 'view' then fp.can_view
        when 'open' then fp.can_open
        when 'upload' then fp.can_upload
        when 'download' then fp.can_download
        when 'edit' then fp.can_edit
        when 'delete' then fp.can_delete
        when 'manage_permissions' then fp.can_manage_permissions
        else false
      end
  );
end;
$$;

create or replace function public.create_folder_record(
  p_category_id uuid,
  p_name text,
  p_parent_folder_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folder_id uuid;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if auth.uid() is null then
    raise exception 'folder management denied';
  end if;

  if not public.has_permission('folders.manage') or not public.has_mfa_level2() then
    raise exception 'folder management denied';
  end if;

  if v_name is null or length(v_name) < 2 then
    raise exception 'folder name is required';
  end if;

  if not exists (
    select 1
    from public.file_categories
    where id = p_category_id
      and active = true
  ) then
    raise exception 'category not found';
  end if;

  if p_parent_folder_id is not null and not exists (
    select 1
    from public.folders
    where id = p_parent_folder_id
      and category_id = p_category_id
  ) then
    raise exception 'parent folder category mismatch';
  end if;

  insert into public.folders (category_id, parent_folder_id, name, created_by)
  values (p_category_id, p_parent_folder_id, v_name, auth.uid())
  returning id into v_folder_id;

  insert into public.systemprotokoll (benutzer_id, aktion, bereich, details)
  values (
    auth.uid(),
    'folder_created',
    'files',
    concat('folder=', v_folder_id::text, '; name=', v_name)
  );

  return v_folder_id;
end;
$$;

create or replace function public.set_folder_permission(
  p_folder_id uuid,
  p_role_id uuid,
  p_can_view boolean default false,
  p_can_open boolean default false,
  p_can_upload boolean default false,
  p_can_download boolean default false,
  p_can_edit boolean default false,
  p_can_delete boolean default false,
  p_can_manage_permissions boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_can_view boolean := coalesce(p_can_view, false);
  v_can_open boolean := coalesce(p_can_open, false);
  v_can_upload boolean := coalesce(p_can_upload, false);
  v_can_download boolean := coalesce(p_can_download, false);
  v_can_edit boolean := coalesce(p_can_edit, false);
  v_can_delete boolean := coalesce(p_can_delete, false);
  v_can_manage_permissions boolean := coalesce(p_can_manage_permissions, false);
begin
  if auth.uid() is null then
    raise exception 'folder management denied';
  end if;

  if not public.has_permission('folders.manage') or not public.has_mfa_level2() then
    raise exception 'folder management denied';
  end if;

  if not exists (select 1 from public.folders where id = p_folder_id) then
    raise exception 'folder not found';
  end if;

  if not exists (
    select 1
    from public.roles
    where id = p_role_id
      and active = true
  ) then
    raise exception 'role not found';
  end if;

  if v_can_manage_permissions then
    v_can_view := true;
    v_can_open := true;
  end if;

  if v_can_delete or v_can_edit or v_can_upload then
    v_can_view := true;
    v_can_open := true;
  end if;

  if v_can_download then
    v_can_view := true;
    v_can_open := true;
  end if;

  if not (
    v_can_view
    or v_can_open
    or v_can_upload
    or v_can_download
    or v_can_edit
    or v_can_delete
    or v_can_manage_permissions
  ) then
    delete from public.folder_permissions
    where folder_id = p_folder_id
      and role_id = p_role_id;
  else
    insert into public.folder_permissions (
      folder_id,
      role_id,
      can_view,
      can_open,
      can_upload,
      can_download,
      can_edit,
      can_delete,
      can_manage_permissions
    )
    values (
      p_folder_id,
      p_role_id,
      v_can_view,
      v_can_open,
      v_can_upload,
      v_can_download,
      v_can_edit,
      v_can_delete,
      v_can_manage_permissions
    )
    on conflict (folder_id, role_id) do update
    set
      can_view = excluded.can_view,
      can_open = excluded.can_open,
      can_upload = excluded.can_upload,
      can_download = excluded.can_download,
      can_edit = excluded.can_edit,
      can_delete = excluded.can_delete,
      can_manage_permissions = excluded.can_manage_permissions,
      updated_at = now();
  end if;

  insert into public.systemprotokoll (benutzer_id, aktion, bereich, details)
  values (
    auth.uid(),
    'folder_permission_changed',
    'files',
    concat('folder=', p_folder_id::text, '; role=', p_role_id::text)
  );
end;
$$;

create or replace function public.delete_empty_folder(p_folder_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'folder management denied';
  end if;

  if not public.has_permission('folders.manage') or not public.has_mfa_level2() then
    raise exception 'folder management denied';
  end if;

  if not exists (select 1 from public.folders where id = p_folder_id) then
    raise exception 'folder not found';
  end if;

  if exists (select 1 from public.files where folder_id = p_folder_id) then
    raise exception 'folder not empty';
  end if;

  if exists (select 1 from public.folders where parent_folder_id = p_folder_id) then
    raise exception 'folder not empty';
  end if;

  delete from public.folders where id = p_folder_id;

  insert into public.systemprotokoll (benutzer_id, aktion, bereich, details)
  values (
    auth.uid(),
    'folder_deleted',
    'files',
    concat('folder=', p_folder_id::text)
  );
end;
$$;

drop policy if exists "folders visible by file permission" on public.folders;
create policy "folders visible by folder rights"
on public.folders for select
to authenticated
using (
  public.has_permission('folders.manage')
  or (
    public.has_permission('folders.view')
    and public.has_folder_permission(id, 'view')
  )
);

drop policy if exists "folders insert by managers" on public.folders;
create policy "folders insert by managers"
on public.folders for insert
to authenticated
with check (public.has_permission('folders.manage') and public.has_mfa_level2());

drop policy if exists "folders update by managers" on public.folders;
create policy "folders update by managers"
on public.folders for update
to authenticated
using (public.has_permission('folders.manage') and public.has_mfa_level2())
with check (public.has_permission('folders.manage') and public.has_mfa_level2());

drop policy if exists "folders delete by managers" on public.folders;
create policy "folders delete by managers"
on public.folders for delete
to authenticated
using (public.has_permission('folders.manage') and public.has_mfa_level2());

drop policy if exists "folder permissions visible to managers" on public.folder_permissions;
create policy "folder permissions visible to managers"
on public.folder_permissions for select
to authenticated
using (public.has_permission('folders.manage'));

drop policy if exists "folder permissions insert by managers" on public.folder_permissions;
create policy "folder permissions insert by managers"
on public.folder_permissions for insert
to authenticated
with check (public.has_permission('folders.manage') and public.has_mfa_level2());

drop policy if exists "folder permissions update by managers" on public.folder_permissions;
create policy "folder permissions update by managers"
on public.folder_permissions for update
to authenticated
using (public.has_permission('folders.manage') and public.has_mfa_level2())
with check (public.has_permission('folders.manage') and public.has_mfa_level2());

drop policy if exists "folder permissions delete by managers" on public.folder_permissions;
create policy "folder permissions delete by managers"
on public.folder_permissions for delete
to authenticated
using (public.has_permission('folders.manage') and public.has_mfa_level2());

drop policy if exists "files visible by file permission" on public.files;
create policy "files visible by folder rights"
on public.files for select
to authenticated
using (
  public.has_permission('files.view')
  and (
    folder_id is null
    or public.has_folder_permission(folder_id, 'view')
  )
);

drop policy if exists "files inserted by upload permission" on public.files;
create policy "files inserted by folder rights"
on public.files for insert
to authenticated
with check (
  public.has_permission('files.upload')
  and (
    folder_id is null
    or public.has_folder_permission(folder_id, 'upload')
  )
);

drop policy if exists "files changed by edit permission" on public.files;
create policy "files changed by folder rights"
on public.files for update
to authenticated
using (
  public.has_permission('files.edit')
  and (
    folder_id is null
    or public.has_folder_permission(folder_id, 'edit')
  )
)
with check (
  public.has_permission('files.edit')
  and (
    folder_id is null
    or public.has_folder_permission(folder_id, 'edit')
  )
);

drop policy if exists "files deleted by delete permission" on public.files;
create policy "files deleted by folder rights"
on public.files for delete
to authenticated
using (
  public.has_permission('files.delete')
  and (
    folder_id is null
    or public.has_folder_permission(folder_id, 'delete')
  )
);

revoke all on function public.has_folder_permission(uuid, text) from public;
revoke all on function public.has_folder_permission(uuid, text) from anon;
grant execute on function public.has_folder_permission(uuid, text) to authenticated;

revoke all on function public.create_folder_record(uuid, text, uuid) from public;
revoke all on function public.create_folder_record(uuid, text, uuid) from anon;
grant execute on function public.create_folder_record(uuid, text, uuid) to authenticated;

revoke all on function public.set_folder_permission(
  uuid,
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) from public;
revoke all on function public.set_folder_permission(
  uuid,
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) from anon;
grant execute on function public.set_folder_permission(
  uuid,
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;

revoke all on function public.delete_empty_folder(uuid) from public;
revoke all on function public.delete_empty_folder(uuid) from anon;
grant execute on function public.delete_empty_folder(uuid) to authenticated;
