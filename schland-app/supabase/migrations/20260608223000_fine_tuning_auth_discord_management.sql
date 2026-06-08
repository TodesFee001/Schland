alter table public.profiles
  add column if not exists username text;

create or replace function public.normalize_profile_username(
  p_value text,
  p_fallback text default 'benutzer'
)
returns text
language plpgsql
immutable
as $$
declare
  v_username text;
begin
  v_username := lower(
    regexp_replace(
      coalesce(nullif(trim(p_value), ''), nullif(trim(p_fallback), ''), 'benutzer'),
      '[^a-zA-Z0-9_.-]+',
      '_',
      'g'
    )
  );
  v_username := regexp_replace(v_username, '^[_\.-]+|[_\.-]+$', '', 'g');
  v_username := left(v_username, 32);

  if length(v_username) < 3 then
    v_username := left(v_username || '_user', 32);
  end if;

  return v_username;
end;
$$;

with normalized as (
  select
    id,
    public.normalize_profile_username(
      coalesce(username, display_name, split_part(coalesce(email, ''), '@', 1)),
      id::text
    ) as base_username,
    row_number() over (
      partition by public.normalize_profile_username(
        coalesce(username, display_name, split_part(coalesce(email, ''), '@', 1)),
        id::text
      )
      order by created_at, id
    ) as duplicate_number
  from public.profiles
)
update public.profiles p
set username = case
  when n.duplicate_number = 1 then n.base_username
  else left(n.base_username, 23) || '_' || replace(left(p.id::text, 8), '-', '')
end
from normalized n
where p.id = n.id
  and (p.username is null or trim(p.username) = '');

alter table public.profiles
  alter column username set not null;

drop index if exists public.profiles_username_lower_idx;
create unique index profiles_username_lower_idx
on public.profiles (lower(username));

alter table public.profiles
  drop constraint if exists profiles_username_format_check,
  add constraint profiles_username_format_check
    check (username ~ '^[a-z0-9_.-]{3,32}$');

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_username text;
  v_candidate text;
  v_counter integer := 0;
begin
  v_base_username := public.normalize_profile_username(
    coalesce(
      new.raw_user_meta_data ->> 'username',
      new.raw_user_meta_data ->> 'display_name',
      split_part(coalesce(new.email, 'benutzer'), '@', 1)
    ),
    new.id::text
  );
  v_candidate := v_base_username;

  while exists (
    select 1
    from public.profiles p
    where lower(p.username) = lower(v_candidate)
      and p.id <> new.id
  ) loop
    v_counter := v_counter + 1;
    v_candidate := left(v_base_username, 28) || '_' || v_counter::text;
  end loop;

  insert into public.profiles (
    id,
    username,
    display_name,
    email,
    status
  )
  values (
    new.id,
    v_candidate,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'username',
      split_part(coalesce(new.email, 'benutzer'), '@', 1)
    ),
    new.email,
    'active'
  )
  on conflict (id) do update
    set email = excluded.email,
        username = coalesce(public.profiles.username, excluded.username),
        updated_at = now();

  return new;
end;
$$;

create or replace function public.claim_first_administrator()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role_id uuid;
  v_existing_admins integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext('schland_first_admin_claim'));

  select count(*)
  into v_existing_admins
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where r.role_key = 'administrator';

  if v_existing_admins > 0 then
    return false;
  end if;

  select id
  into v_role_id
  from public.roles
  where role_key = 'administrator'
    and active = true
  limit 1;

  if v_role_id is null then
    raise exception 'administrator role not found';
  end if;

  insert into public.profiles (
    id,
    username,
    display_name,
    email,
    status
  )
  select
    au.id,
    public.normalize_profile_username(
      coalesce(
        au.raw_user_meta_data ->> 'username',
        au.raw_user_meta_data ->> 'display_name',
        split_part(coalesce(au.email, 'benutzer'), '@', 1)
      ),
      au.id::text
    ),
    coalesce(
      au.raw_user_meta_data ->> 'display_name',
      au.raw_user_meta_data ->> 'username',
      split_part(coalesce(au.email, 'benutzer'), '@', 1)
    ),
    au.email,
    'active'
  from auth.users au
  where au.id = v_user_id
  on conflict (id) do update
    set email = excluded.email,
        username = coalesce(public.profiles.username, excluded.username),
        updated_at = now();

  insert into public.user_roles (user_id, role_id)
  values (v_user_id, v_role_id)
  on conflict do nothing;

  return true;
end;
$$;

alter table public.members
  add column if not exists discord_joined_at timestamptz,
  add column if not exists discord_last_seen_at timestamptz,
  add column if not exists discord_on_server boolean not null default false,
  add column if not exists discord_is_bot boolean not null default false;

create index if not exists members_discord_on_server_idx
on public.members (discord_on_server);

create index if not exists members_discord_last_seen_idx
on public.members (discord_last_seen_at desc);

alter table public.discord_invite_requests
  alter column requested_permission_id drop not null,
  add column if not exists invitee_discord_id text,
  add column if not exists dm_status text not null default 'pending',
  add column if not exists dm_error text,
  add column if not exists dm_sent_at timestamptz;

alter table public.discord_invite_requests
  drop constraint if exists discord_invite_requests_dm_status_check,
  add constraint discord_invite_requests_dm_status_check
    check (dm_status in ('pending', 'sent', 'failed', 'skipped'));

create index if not exists discord_invite_requests_invitee_discord_idx
on public.discord_invite_requests (invitee_discord_id);

alter table public.discord_moderation_events
  drop constraint if exists discord_moderation_events_event_type_check,
  add constraint discord_moderation_events_event_type_check
    check (event_type in ('warn', 'timeout', 'ban', 'kick', 'voice_disconnect'));

insert into public.permissions (permission_key, description)
values
  ('categories.manage', 'Kategorien verwalten')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_key = 'categories.manage'
where r.role_key = 'administrator'
on conflict do nothing;

create or replace function public.update_member_case(
  p_member_id uuid,
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
  p_notes text default null,
  p_status public.member_status default 'active'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_user_id uuid := auth.uid();
  v_username text;
begin
  if v_user_id is null then
    raise exception 'member case update denied';
  end if;

  if not public.has_permission('members.edit') or not public.has_mfa_level2() then
    raise exception 'member case update denied';
  end if;

  if p_member_id is null then
    raise exception 'member not found';
  end if;

  if v_reason is null or length(v_reason) < 8 then
    raise exception 'reason is required';
  end if;

  if v_name is null then
    raise exception 'member name is required';
  end if;

  if p_age is not null and p_age < 0 then
    raise exception 'member age must be positive';
  end if;

  select *
  into v_member
  from public.members
  where id = p_member_id;

  if not found then
    raise exception 'member not found';
  end if;

  select coalesce(display_name, username, email, v_user_id::text)
  into v_username
  from public.profiles
  where id = v_user_id;

  update public.members
  set
    name = v_name,
    age = p_age,
    residence = nullif(trim(coalesce(p_residence, '')), ''),
    profession = nullif(trim(coalesce(p_profession, '')), ''),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    discord_id = nullif(trim(coalesce(p_discord_id, '')), ''),
    discord_username = nullif(trim(coalesce(p_discord_username, '')), ''),
    discord_display_name = nullif(trim(coalesce(p_discord_display_name, '')), ''),
    instagram = nullif(trim(coalesce(p_instagram, '')), ''),
    snapchat = nullif(trim(coalesce(p_snapchat, '')), ''),
    tiktok = nullif(trim(coalesce(p_tiktok, '')), ''),
    stream = nullif(trim(coalesce(p_stream, '')), ''),
    ubisoft = nullif(trim(coalesce(p_ubisoft, '')), ''),
    ea = nullif(trim(coalesce(p_ea, '')), ''),
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    status = coalesce(p_status, v_member.status),
    updated_at = now()
  where id = p_member_id;

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
    'member',
    jsonb_build_object(
      'name', v_member.name,
      'discord_id', v_member.discord_id,
      'status', v_member.status
    )::text,
    jsonb_build_object(
      'name', v_name,
      'discord_id', nullif(trim(coalesce(p_discord_id, '')), ''),
      'status', coalesce(p_status, v_member.status)
    )::text,
    true
  );
end;
$$;

create or replace function public.upsert_file_category(
  p_category_id uuid,
  p_name text,
  p_description text default null,
  p_sort_order integer default null,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_id uuid;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_sort_order integer := coalesce(p_sort_order, 0);
begin
  if auth.uid() is null then
    raise exception 'category management denied';
  end if;

  if not (
    public.has_permission('categories.manage')
    or public.has_permission('files.manage')
  ) or not public.has_mfa_level2() then
    raise exception 'category management denied';
  end if;

  if v_name is null or length(v_name) < 2 then
    raise exception 'category name is required';
  end if;

  if p_category_id is null then
    if v_sort_order <= 0 then
      select coalesce(max(sort_order), 0) + 10
      into v_sort_order
      from public.file_categories;
    end if;

    insert into public.file_categories (name, description, sort_order, active)
    values (
      v_name,
      nullif(trim(coalesce(p_description, '')), ''),
      v_sort_order,
      coalesce(p_active, true)
    )
    returning id into v_category_id;
  else
    update public.file_categories
    set
      name = v_name,
      description = nullif(trim(coalesce(p_description, '')), ''),
      sort_order = v_sort_order,
      active = coalesce(p_active, true),
      updated_at = now()
    where id = p_category_id
    returning id into v_category_id;

    if v_category_id is null then
      raise exception 'category not found';
    end if;
  end if;

  insert into public.systemprotokoll (benutzer_id, aktion, bereich, details)
  values (
    auth.uid(),
    case when p_category_id is null then 'category_created' else 'category_saved' end,
    'files',
    concat('category=', v_category_id::text, '; name=', v_name)
  );

  return v_category_id;
end;
$$;

create or replace function public.save_role(
  p_role_id uuid,
  p_role_key text,
  p_name text,
  p_description text default null,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_role_key text := public.normalize_profile_username(p_role_key, p_name);
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_existing_key text;
begin
  if auth.uid() is null then
    raise exception 'role management denied';
  end if;

  if not public.has_permission('roles.manage') or not public.has_mfa_level2() then
    raise exception 'role management denied';
  end if;

  v_role_key := replace(v_role_key, '.', '_');
  v_role_key := replace(v_role_key, '-', '_');

  if v_name is null or length(v_name) < 2 then
    raise exception 'role name is required';
  end if;

  if p_role_id is null then
    insert into public.roles (role_key, name, description, active)
    values (
      v_role_key,
      v_name,
      nullif(trim(coalesce(p_description, '')), ''),
      coalesce(p_active, true)
    )
    returning id into v_role_id;
  else
    select role_key into v_existing_key
    from public.roles
    where id = p_role_id;

    if v_existing_key is null then
      raise exception 'role not found';
    end if;

    if v_existing_key = 'administrator' and coalesce(p_active, true) = false then
      raise exception 'administrator role cannot be disabled';
    end if;

    update public.roles
    set
      role_key = case when v_existing_key = 'administrator' then v_existing_key else v_role_key end,
      name = v_name,
      description = nullif(trim(coalesce(p_description, '')), ''),
      active = coalesce(p_active, true),
      updated_at = now()
    where id = p_role_id
    returning id into v_role_id;
  end if;

  insert into public.systemprotokoll (benutzer_id, aktion, bereich, details)
  values (
    auth.uid(),
    case when p_role_id is null then 'role_created' else 'role_saved' end,
    'roles',
    concat('role=', v_role_id::text, '; key=', v_role_key)
  );

  return v_role_id;
end;
$$;

create or replace function public.set_role_permission_assignment(
  p_role_id uuid,
  p_permission_id uuid,
  p_assign boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_key text;
  v_permission_key text;
begin
  if auth.uid() is null then
    raise exception 'role permission denied';
  end if;

  if not public.has_permission('roles.manage') or not public.has_mfa_level2() then
    raise exception 'role permission denied';
  end if;

  select role_key
  into v_role_key
  from public.roles
  where id = p_role_id
    and active = true;

  if v_role_key is null then
    raise exception 'role not found';
  end if;

  select permission_key
  into v_permission_key
  from public.permissions
  where id = p_permission_id;

  if v_permission_key is null then
    raise exception 'permission not found';
  end if;

  if p_assign then
    insert into public.role_permissions (role_id, permission_id)
    values (p_role_id, p_permission_id)
    on conflict do nothing;
  else
    if v_role_key = 'administrator'
      and v_permission_key in ('app.enter', 'roles.manage', 'users.manage')
    then
      raise exception 'administrator core permission cannot be removed';
    end if;

    delete from public.role_permissions
    where role_id = p_role_id
      and permission_id = p_permission_id;
  end if;

  insert into public.systemprotokoll (benutzer_id, aktion, bereich, details)
  values (
    auth.uid(),
    case when p_assign then 'role_permission_added' else 'role_permission_removed' end,
    'roles',
    concat('role=', p_role_id::text, '; permission=', p_permission_id::text)
  );
end;
$$;

create or replace function public.create_discord_invite_request(
  p_invitee_discord_id text,
  p_invitee_name text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_id uuid;
  v_invitee_discord_id text := nullif(trim(coalesce(p_invitee_discord_id, '')), '');
  v_invitee_name text := nullif(trim(coalesce(p_invitee_name, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_user_id uuid := auth.uid();
  v_username text;
begin
  if v_user_id is null then
    raise exception 'discord invite request denied';
  end if;

  if not public.has_permission('discord.invites.create') or not public.has_mfa_level2() then
    raise exception 'discord invite request denied';
  end if;

  if v_invitee_discord_id is null
    or v_invitee_discord_id !~ '^[0-9]{15,25}$'
  then
    raise exception 'invitee discord id is required';
  end if;

  if v_invitee_name is null then
    v_invitee_name := v_invitee_discord_id;
  end if;

  if length(v_invitee_name) < 2 then
    raise exception 'invitee name is required';
  end if;

  if v_reason is null or length(v_reason) < 8 then
    raise exception 'reason is required';
  end if;

  select coalesce(display_name, username, email, v_user_id::text)
  into v_username
  from public.profiles
  where id = v_user_id;

  insert into public.discord_invite_requests (
    target_member_id,
    invitee_name,
    invitee_discord_id,
    reason,
    requested_permission_id,
    requested_by,
    requested_by_name,
    status,
    max_uses,
    uses,
    expires_at,
    dm_status
  )
  values (
    null,
    v_invitee_name,
    v_invitee_discord_id,
    v_reason,
    null,
    v_user_id,
    v_username,
    'pending',
    1,
    0,
    now() + interval '1 day',
    'pending'
  )
  returning id into v_invite_id;

  return v_invite_id;
end;
$$;

revoke all on function public.normalize_profile_username(text, text) from public;
revoke all on function public.normalize_profile_username(text, text) from anon;
grant execute on function public.normalize_profile_username(text, text) to authenticated;

revoke all on function public.update_member_case(
  uuid,
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
  text,
  public.member_status
) from public;
revoke all on function public.update_member_case(
  uuid,
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
  text,
  public.member_status
) from anon;
grant execute on function public.update_member_case(
  uuid,
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
  text,
  public.member_status
) to authenticated;

revoke all on function public.upsert_file_category(uuid, text, text, integer, boolean) from public;
revoke all on function public.upsert_file_category(uuid, text, text, integer, boolean) from anon;
grant execute on function public.upsert_file_category(uuid, text, text, integer, boolean) to authenticated;

revoke all on function public.save_role(uuid, text, text, text, boolean) from public;
revoke all on function public.save_role(uuid, text, text, text, boolean) from anon;
grant execute on function public.save_role(uuid, text, text, text, boolean) to authenticated;

revoke all on function public.set_role_permission_assignment(uuid, uuid, boolean) from public;
revoke all on function public.set_role_permission_assignment(uuid, uuid, boolean) from anon;
grant execute on function public.set_role_permission_assignment(uuid, uuid, boolean) to authenticated;

revoke all on function public.create_discord_invite_request(text, text, text) from public;
revoke all on function public.create_discord_invite_request(text, text, text) from anon;
grant execute on function public.create_discord_invite_request(text, text, text) to authenticated;
