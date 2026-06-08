create or replace function public.set_member_file_link(
  p_member_id uuid,
  p_file_id uuid,
  p_reason text,
  p_link boolean default true,
  p_relation_type text default 'linked'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file_folder_id uuid;
  v_file_name text;
  v_member_name text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_relation_type text := lower(nullif(trim(coalesce(p_relation_type, 'linked')), ''));
  v_user_id uuid := auth.uid();
  v_username text;
begin
  if v_user_id is null then
    raise exception 'member file link denied';
  end if;

  if not public.has_permission('members.edit') or not public.has_mfa_level2() then
    raise exception 'member file link denied';
  end if;

  if p_member_id is null or p_file_id is null then
    raise exception 'member file link data required';
  end if;

  if v_reason is null or length(v_reason) < 8 then
    raise exception 'reason is required';
  end if;

  if v_relation_type is null or v_relation_type not in ('linked', 'evidence', 'note', 'avatar') then
    v_relation_type := 'linked';
  end if;

  select name
  into v_member_name
  from public.members
  where id = p_member_id;

  if not found then
    raise exception 'member not found';
  end if;

  select folder_id, original_filename
  into v_file_folder_id, v_file_name
  from public.files
  where id = p_file_id;

  if not found then
    raise exception 'file not found';
  end if;

  if not public.has_permission('files.view') or not public.has_permission('files.open') then
    raise exception 'file access denied';
  end if;

  if v_file_folder_id is not null and not public.has_folder_permission(v_file_folder_id, 'open') then
    raise exception 'file access denied';
  end if;

  select coalesce(display_name, email, v_user_id::text)
  into v_username
  from public.profiles
  where id = v_user_id;

  if p_link then
    insert into public.member_files (member_id, file_id, relation_type, created_by)
    values (p_member_id, p_file_id, v_relation_type, v_user_id)
    on conflict (member_id, file_id) do update
    set
      relation_type = excluded.relation_type,
      created_by = excluded.created_by;

    insert into public.member_case_logs (
      user_id,
      username,
      member_id,
      action,
      reason,
      related_file_id,
      success
    )
    values (
      v_user_id,
      v_username,
      p_member_id,
      'link_file',
      v_reason,
      p_file_id,
      true
    );
  else
    delete from public.member_files
    where member_id = p_member_id
      and file_id = p_file_id;

    if not found then
      raise exception 'member file link not found';
    end if;

    insert into public.member_case_logs (
      user_id,
      username,
      member_id,
      action,
      reason,
      related_file_id,
      success
    )
    values (
      v_user_id,
      v_username,
      p_member_id,
      'unlink_file',
      v_reason,
      p_file_id,
      true
    );
  end if;
end;
$$;

drop policy if exists "member files visible with member access" on public.member_files;
create policy "member files visible with member access"
on public.member_files for select
to authenticated
using (public.has_permission('members.open') and public.has_mfa_level2());

drop policy if exists "member files insert by editors" on public.member_files;
create policy "member files insert by editors"
on public.member_files for insert
to authenticated
with check (public.has_permission('members.edit') and public.has_mfa_level2());

drop policy if exists "member files update by editors" on public.member_files;
create policy "member files update by editors"
on public.member_files for update
to authenticated
using (public.has_permission('members.edit') and public.has_mfa_level2())
with check (public.has_permission('members.edit') and public.has_mfa_level2());

drop policy if exists "member files delete by editors" on public.member_files;
create policy "member files delete by editors"
on public.member_files for delete
to authenticated
using (public.has_permission('members.edit') and public.has_mfa_level2());

revoke all on function public.set_member_file_link(
  uuid,
  uuid,
  text,
  boolean,
  text
) from public;
revoke all on function public.set_member_file_link(
  uuid,
  uuid,
  text,
  boolean,
  text
) from anon;
grant execute on function public.set_member_file_link(
  uuid,
  uuid,
  text,
  boolean,
  text
) to authenticated;
