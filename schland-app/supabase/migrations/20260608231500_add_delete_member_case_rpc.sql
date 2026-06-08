create or replace function public.delete_member_case(
  p_member_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_user_id uuid := auth.uid();
  v_username text;
begin
  if v_user_id is null then
    raise exception 'member case delete denied';
  end if;

  if not public.has_permission('members.edit') or not public.has_mfa_level2() then
    raise exception 'member case delete denied';
  end if;

  if p_member_id is null then
    raise exception 'member not found';
  end if;

  if v_reason is null or length(v_reason) < 8 then
    raise exception 'reason is required';
  end if;

  select *
  into v_member
  from public.members
  where id = p_member_id
  for update;

  if not found then
    raise exception 'member not found';
  end if;

  select coalesce(display_name, username, email, v_user_id::text)
  into v_username
  from public.profiles
  where id = v_user_id;

  insert into public.member_case_logs (
    user_id,
    username,
    member_id,
    action,
    reason,
    field_name,
    old_value,
    new_value,
    success
  )
  values (
    v_user_id,
    v_username,
    p_member_id,
    'edit',
    v_reason,
    'deleted',
    jsonb_build_object(
      'id', v_member.id,
      'name', v_member.name,
      'discord_id', v_member.discord_id,
      'discord_username', v_member.discord_username,
      'discord_display_name', v_member.discord_display_name,
      'status', v_member.status
    )::text,
    null,
    true
  );

  delete from public.members
  where id = p_member_id;

  insert into public.systemprotokoll (benutzer_id, aktion, bereich, details)
  values (
    v_user_id,
    'member_case_deleted',
    'members',
    concat(
      'member=',
      p_member_id::text,
      '; name=',
      v_member.name,
      '; discord=',
      coalesce(v_member.discord_id, '-')
    )
  );
end;
$$;

revoke all on function public.delete_member_case(uuid, text) from public;
revoke all on function public.delete_member_case(uuid, text) from anon;
grant execute on function public.delete_member_case(uuid, text) to authenticated;
