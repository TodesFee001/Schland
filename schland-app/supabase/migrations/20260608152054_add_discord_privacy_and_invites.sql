alter table public.members
  add column if not exists discord_analytics_enabled boolean not null default true,
  add column if not exists discord_analytics_disabled_reason text,
  add column if not exists discord_analytics_disabled_at timestamptz,
  add column if not exists discord_analytics_disabled_by uuid references public.profiles(id) on delete set null;

create index if not exists members_discord_analytics_enabled_idx
on public.members (discord_analytics_enabled);

insert into public.permissions (permission_key, description)
values
  ('discord.invites.create', 'Discord-Einladung ueber Datenbank anlegen')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_key = 'discord.invites.create'
where r.role_key in ('administrator', 'member_case_editor')
on conflict do nothing;

create table if not exists public.discord_invite_requests (
  id uuid primary key default gen_random_uuid(),
  target_member_id uuid references public.members(id) on delete set null,
  invitee_name text not null,
  reason text not null,
  requested_permission_id uuid not null references public.permissions(id) on delete restrict,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_by_name text,
  status text not null default 'pending',
  max_uses integer not null default 1,
  uses integer not null default 0,
  expires_at timestamptz not null default (now() + interval '1 day'),
  discord_invite_code text,
  discord_invite_url text,
  bot_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discord_invite_requests_invitee_name_length check (char_length(btrim(invitee_name)) >= 2),
  constraint discord_invite_requests_reason_length check (char_length(btrim(reason)) >= 8),
  constraint discord_invite_requests_status_check check (status in ('pending', 'created', 'used', 'expired', 'cancelled', 'failed')),
  constraint discord_invite_requests_one_use_check check (max_uses = 1),
  constraint discord_invite_requests_uses_check check (uses >= 0 and uses <= 1),
  constraint discord_invite_requests_one_day_check check (expires_at > created_at and expires_at <= created_at + interval '1 day')
);

create index if not exists discord_invite_requests_status_expires_idx
on public.discord_invite_requests (status, expires_at);

create index if not exists discord_invite_requests_target_member_idx
on public.discord_invite_requests (target_member_id);

create trigger discord_invite_requests_updated_at
before update on public.discord_invite_requests
for each row execute function public.set_updated_at();

alter table public.discord_invite_requests enable row level security;

drop policy if exists "discord invites visible to managers" on public.discord_invite_requests;
create policy "discord invites visible to managers"
on public.discord_invite_requests for select
to authenticated
using (
  public.has_permission('discord.invites.create')
  or public.has_permission('sync.manage')
);

drop policy if exists "discord invites inserted by permitted users" on public.discord_invite_requests;
create policy "discord invites inserted by permitted users"
on public.discord_invite_requests for insert
to authenticated
with check (
  public.has_permission('discord.invites.create')
  and public.has_mfa_level2()
  and max_uses = 1
  and uses = 0
  and status = 'pending'
  and expires_at <= created_at + interval '1 day'
);

drop policy if exists "discord invites updated by sync managers" on public.discord_invite_requests;
create policy "discord invites updated by sync managers"
on public.discord_invite_requests for update
to authenticated
using (public.has_permission('sync.manage') and public.has_mfa_level2())
with check (
  public.has_permission('sync.manage')
  and public.has_mfa_level2()
  and max_uses = 1
  and uses >= 0
  and uses <= 1
  and expires_at <= created_at + interval '1 day'
);

revoke all on table public.discord_invite_requests from anon;
grant select, insert, update on table public.discord_invite_requests to authenticated;

create or replace function public.set_member_discord_analytics(
  p_member_id uuid,
  p_enabled boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_name text;
  v_old_enabled boolean;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_user_id uuid := auth.uid();
  v_username text;
begin
  if v_user_id is null then
    raise exception 'discord analytics setting denied';
  end if;

  if not public.has_permission('members.edit') or not public.has_mfa_level2() then
    raise exception 'discord analytics setting denied';
  end if;

  if p_member_id is null then
    raise exception 'member not found';
  end if;

  if p_enabled is null then
    raise exception 'discord analytics setting required';
  end if;

  if v_reason is null or length(v_reason) < 8 then
    raise exception 'reason is required';
  end if;

  select name, discord_analytics_enabled
  into v_member_name, v_old_enabled
  from public.members
  where id = p_member_id;

  if not found then
    raise exception 'member not found';
  end if;

  select coalesce(display_name, email, v_user_id::text)
  into v_username
  from public.profiles
  where id = v_user_id;

  update public.members
  set
    discord_analytics_enabled = p_enabled,
    discord_analytics_disabled_reason = case when p_enabled then null else v_reason end,
    discord_analytics_disabled_at = case when p_enabled then null else now() end,
    discord_analytics_disabled_by = case when p_enabled then null else v_user_id end,
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
    'discord_analytics_enabled',
    v_old_enabled::text,
    p_enabled::text,
    true
  );
end;
$$;

create or replace function public.create_discord_invite_request(
  p_invitee_name text,
  p_reason text,
  p_permission_id uuid,
  p_target_member_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_id uuid;
  v_invitee_name text := nullif(trim(coalesce(p_invitee_name, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_user_id uuid := auth.uid();
  v_username text;
  v_permission_key text;
  v_target_name text;
begin
  if v_user_id is null then
    raise exception 'discord invite request denied';
  end if;

  if not public.has_permission('discord.invites.create') or not public.has_mfa_level2() then
    raise exception 'discord invite request denied';
  end if;

  if v_invitee_name is null or length(v_invitee_name) < 2 then
    raise exception 'invitee name is required';
  end if;

  if v_reason is null or length(v_reason) < 8 then
    raise exception 'reason is required';
  end if;

  if p_permission_id is null then
    raise exception 'invite permission is required';
  end if;

  select permission_key
  into v_permission_key
  from public.permissions
  where id = p_permission_id;

  if not found then
    raise exception 'invite permission not found';
  end if;

  if p_target_member_id is not null then
    select name
    into v_target_name
    from public.members
    where id = p_target_member_id;

    if not found then
      raise exception 'target member not found';
    end if;
  end if;

  select coalesce(display_name, email, v_user_id::text)
  into v_username
  from public.profiles
  where id = v_user_id;

  insert into public.discord_invite_requests (
    target_member_id,
    invitee_name,
    reason,
    requested_permission_id,
    requested_by,
    requested_by_name,
    status,
    max_uses,
    uses,
    expires_at
  )
  values (
    p_target_member_id,
    v_invitee_name,
    v_reason,
    p_permission_id,
    v_user_id,
    v_username,
    'pending',
    1,
    0,
    now() + interval '1 day'
  )
  returning id into v_invite_id;

  return v_invite_id;
end;
$$;

revoke all on function public.set_member_discord_analytics(uuid, boolean, text) from public;
revoke all on function public.set_member_discord_analytics(uuid, boolean, text) from anon;
grant execute on function public.set_member_discord_analytics(uuid, boolean, text) to authenticated;

revoke all on function public.create_discord_invite_request(text, text, uuid, uuid) from public;
revoke all on function public.create_discord_invite_request(text, text, uuid, uuid) from anon;
grant execute on function public.create_discord_invite_request(text, text, uuid, uuid) to authenticated;
