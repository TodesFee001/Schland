create or replace function public.create_member_case(
  p_reason text,
  p_name text,
  p_age integer default null,
  p_residence text default null,
  p_profession text default null,
  p_phone text default null,
  p_discord_id text default null,
  p_discord_username text default null,
  p_discord_display_name text default null,
  p_instagram text default null,
  p_snapchat text default null,
  p_tiktok text default null,
  p_stream text default null,
  p_ubisoft text default null,
  p_ea text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_reason text := trim(coalesce(p_reason, ''));
  v_username text;
begin
  select display_name into v_username from public.profiles where id = auth.uid();

  if length(v_reason) < 8 then
    insert into public.member_case_logs (
      user_id, username, action, reason, success
    )
    values (
      auth.uid(), v_username, 'failed_access', p_reason, false
    );
    raise exception 'member case create reason is required';
  end if;

  if not public.has_permission('members.edit') or not public.has_mfa_level2() then
    insert into public.member_case_logs (
      user_id, username, action, reason, success
    )
    values (
      auth.uid(), v_username, 'failed_access', p_reason, false
    );
    raise exception 'member case create denied';
  end if;

  if v_name is null then
    raise exception 'member name is required';
  end if;

  if p_age is not null and p_age < 0 then
    raise exception 'member age must be positive';
  end if;

  insert into public.members (
    name,
    age,
    residence,
    profession,
    phone,
    discord_id,
    discord_username,
    discord_display_name,
    instagram,
    snapchat,
    tiktok,
    stream,
    ubisoft,
    ea,
    notes,
    status
  )
  values (
    v_name,
    p_age,
    nullif(trim(coalesce(p_residence, '')), ''),
    nullif(trim(coalesce(p_profession, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_discord_id, '')), ''),
    nullif(trim(coalesce(p_discord_username, '')), ''),
    nullif(trim(coalesce(p_discord_display_name, '')), ''),
    nullif(trim(coalesce(p_instagram, '')), ''),
    nullif(trim(coalesce(p_snapchat, '')), ''),
    nullif(trim(coalesce(p_tiktok, '')), ''),
    nullif(trim(coalesce(p_stream, '')), ''),
    nullif(trim(coalesce(p_ubisoft, '')), ''),
    nullif(trim(coalesce(p_ea, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    'review'
  )
  returning id into v_member_id;

  insert into public.member_case_logs (
    user_id,
    username,
    member_id,
    action,
    reason,
    field_name,
    new_value,
    success
  )
  values (
    auth.uid(),
    v_username,
    v_member_id,
    'create',
    v_reason,
    'member',
    v_name,
    true
  );

  return v_member_id;
end;
$$;

revoke all on function public.create_member_case(
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public;
revoke all on function public.create_member_case(
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from anon;
grant execute on function public.create_member_case(
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;
