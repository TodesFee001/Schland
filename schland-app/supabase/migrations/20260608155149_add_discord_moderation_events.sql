insert into public.permissions (permission_key, description)
values
  ('moderation.view', 'Moderationsregister anzeigen'),
  ('moderation.manage', 'Moderationsregister verwalten')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_key in ('moderation.view', 'moderation.manage')
where r.role_key = 'administrator'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_key = 'moderation.view'
where r.role_key = 'member_case_editor'
on conflict do nothing;

create table if not exists public.discord_moderation_events (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'discord',
  external_event_id text,
  member_id uuid references public.members(id) on delete set null,
  discord_user_id text not null,
  discord_username text,
  event_type text not null,
  status text not null default 'active',
  reason text,
  moderator_discord_id text,
  moderator_name text,
  channel_id text,
  channel_name text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discord_moderation_events_event_type_check check (event_type in ('timeout', 'ban', 'kick', 'voice_disconnect')),
  constraint discord_moderation_events_status_check check (status in ('active', 'expired', 'lifted', 'recorded', 'failed')),
  constraint discord_moderation_events_duration_check check (duration_seconds is null or duration_seconds >= 0),
  constraint discord_moderation_events_time_check check (ended_at is null or ended_at >= started_at),
  constraint discord_moderation_events_duration_required_check check (
    event_type not in ('timeout', 'ban')
    or status in ('failed', 'lifted')
    or duration_seconds is not null
    or ended_at is null
  ),
  unique (source, external_event_id)
);

create index if not exists discord_moderation_events_member_idx
on public.discord_moderation_events (member_id);

create index if not exists discord_moderation_events_user_idx
on public.discord_moderation_events (discord_user_id);

create index if not exists discord_moderation_events_type_status_idx
on public.discord_moderation_events (event_type, status);

create index if not exists discord_moderation_events_started_at_idx
on public.discord_moderation_events (started_at desc);

create index if not exists discord_moderation_events_active_until_idx
on public.discord_moderation_events (ended_at)
where status = 'active';

create trigger discord_moderation_events_updated_at
before update on public.discord_moderation_events
for each row execute function public.set_updated_at();

alter table public.discord_moderation_events enable row level security;

drop policy if exists "moderation events visible to moderators" on public.discord_moderation_events;
create policy "moderation events visible to moderators"
on public.discord_moderation_events for select
to authenticated
using (public.has_permission('moderation.view') and public.has_mfa_level2());

drop policy if exists "moderation events managed by sync managers" on public.discord_moderation_events;
create policy "moderation events managed by sync managers"
on public.discord_moderation_events for all
to authenticated
using (public.has_permission('moderation.manage') and public.has_mfa_level2())
with check (public.has_permission('moderation.manage') and public.has_mfa_level2());

revoke all on table public.discord_moderation_events from anon;
grant select, insert, update, delete on table public.discord_moderation_events to authenticated;
