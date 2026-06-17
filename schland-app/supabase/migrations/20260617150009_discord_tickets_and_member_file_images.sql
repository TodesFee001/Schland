create sequence if not exists public.discord_ticket_number_seq;

create table if not exists public.discord_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default (
    'TICKET-' ||
    to_char(now() at time zone 'Europe/Berlin', 'YYYYMMDD') ||
    '-' ||
    lpad(nextval('public.discord_ticket_number_seq')::text, 4, '0')
  ),
  guild_id text not null,
  channel_id text unique,
  channel_name text,
  creator_discord_user_id text not null,
  creator_discord_username text,
  ticket_type text not null,
  status text not null default 'open',
  incident_at timestamptz,
  incident_time_text text,
  incident_channel_id text,
  incident_channel_name text,
  description text not null default '',
  desired_outcome text not null default '',
  metadata jsonb not null default '{}',
  advice_case_ids uuid[] not null default '{}',
  closed_at timestamptz,
  close_reason text,
  closed_by_discord_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discord_tickets_number_check
    check (ticket_number ~ '^TICKET-[0-9]{8}-[0-9]{4,}$'),
  constraint discord_tickets_type_check
    check (ticket_type in ('government_request', 'member_dispute', 'government_member_dispute')),
  constraint discord_tickets_status_check
    check (status in ('open', 'advice_running', 'advice_ready', 'closed', 'cancelled'))
);

create table if not exists public.discord_ticket_participants (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.discord_tickets(id) on delete cascade,
  discord_user_id text not null,
  discord_username text,
  role text not null,
  excluded_from_ticket boolean not null default false,
  added_by_discord_user_id text,
  added_reason text,
  created_at timestamptz not null default now(),
  constraint discord_ticket_participants_role_check
    check (role in ('creator', 'counterpart', 'excluded', 'added')),
  unique (ticket_id, discord_user_id, role)
);

create table if not exists public.discord_ticket_evidence (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.discord_tickets(id) on delete cascade,
  discord_message_id text,
  author_discord_user_id text,
  author_discord_username text,
  evidence_type text not null,
  content text,
  external_url text,
  attachment_filename text,
  attachment_content_type text,
  attachment_size bigint,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint discord_ticket_evidence_type_check
    check (evidence_type in ('message', 'message_link', 'attachment', 'screenshot', 'file', 'transcript', 'note', 'other'))
);

create table if not exists public.discord_ticket_logs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.discord_tickets(id) on delete cascade,
  action text not null,
  actor_discord_user_id text,
  actor_discord_username text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.member_file_image_requests (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  discord_user_id text not null,
  discord_username text,
  member_id uuid references public.members(id) on delete set null,
  status text not null default 'pending',
  joined_at timestamptz not null,
  message_due_at timestamptz not null,
  message_sent_at timestamptz,
  deadline_at timestamptz,
  request_message_id text,
  submitted_message_id text,
  file_id uuid references public.files(id) on delete set null,
  warning_event_id uuid references public.discord_moderation_events(id) on delete set null,
  last_error text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_file_image_requests_status_check
    check (status in (
      'pending',
      'message_due',
      'message_sent',
      'submitted',
      'invalid_response',
      'overdue',
      'warning_queued',
      'warning_recorded',
      'dm_failed',
      'cancelled'
    ))
);

create table if not exists public.member_file_image_request_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.member_file_image_requests(id) on delete cascade,
  action text not null,
  actor_discord_user_id text,
  discord_message_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint member_file_image_request_logs_action_check
    check (action in (
      'member_join_recorded',
      'request_message_sent',
      'request_message_failed',
      'image_submitted',
      'invalid_response_received',
      'deadline_missed',
      'warning_queued',
      'warning_recorded',
      'request_cancelled'
    ))
);

create index if not exists discord_tickets_channel_idx
on public.discord_tickets (channel_id);

create index if not exists discord_tickets_status_created_idx
on public.discord_tickets (status, created_at desc);

create index if not exists discord_tickets_creator_status_idx
on public.discord_tickets (creator_discord_user_id, status);

create index if not exists discord_ticket_participants_ticket_idx
on public.discord_ticket_participants (ticket_id, role);

create index if not exists discord_ticket_participants_user_idx
on public.discord_ticket_participants (discord_user_id);

create index if not exists discord_ticket_evidence_ticket_idx
on public.discord_ticket_evidence (ticket_id, created_at);

create index if not exists discord_ticket_evidence_message_idx
on public.discord_ticket_evidence (discord_message_id);

create index if not exists discord_ticket_logs_ticket_idx
on public.discord_ticket_logs (ticket_id, created_at desc);

create index if not exists member_file_image_requests_due_idx
on public.member_file_image_requests (status, message_due_at);

create index if not exists member_file_image_requests_deadline_idx
on public.member_file_image_requests (status, deadline_at);

create index if not exists member_file_image_requests_discord_user_idx
on public.member_file_image_requests (discord_user_id);

create unique index if not exists member_file_image_requests_one_active_per_user
on public.member_file_image_requests (guild_id, discord_user_id)
where status in ('pending', 'message_due', 'message_sent', 'invalid_response', 'overdue', 'warning_queued');

create index if not exists member_file_image_request_logs_request_idx
on public.member_file_image_request_logs (request_id, created_at desc);

drop trigger if exists discord_tickets_updated_at on public.discord_tickets;
create trigger discord_tickets_updated_at
before update on public.discord_tickets
for each row execute function public.set_updated_at();

drop trigger if exists member_file_image_requests_updated_at on public.member_file_image_requests;
create trigger member_file_image_requests_updated_at
before update on public.member_file_image_requests
for each row execute function public.set_updated_at();

alter table public.discord_tickets enable row level security;
alter table public.discord_ticket_participants enable row level security;
alter table public.discord_ticket_evidence enable row level security;
alter table public.discord_ticket_logs enable row level security;
alter table public.member_file_image_requests enable row level security;
alter table public.member_file_image_request_logs enable row level security;

drop policy if exists "discord tickets visible to moderators" on public.discord_tickets;
create policy "discord tickets visible to moderators"
on public.discord_tickets for select
to authenticated
using (
  public.has_mfa_level2()
  and (
    public.has_permission('moderation.view')
    or public.has_permission('moderation.manage')
  )
);

drop policy if exists "discord tickets managed by moderators" on public.discord_tickets;
create policy "discord tickets managed by moderators"
on public.discord_tickets for all
to authenticated
using (public.has_mfa_level2() and public.has_permission('moderation.manage'))
with check (public.has_mfa_level2() and public.has_permission('moderation.manage'));

drop policy if exists "discord ticket participants visible to moderators" on public.discord_ticket_participants;
create policy "discord ticket participants visible to moderators"
on public.discord_ticket_participants for select
to authenticated
using (
  exists (
    select 1
    from public.discord_tickets ticket
    where ticket.id = discord_ticket_participants.ticket_id
      and public.has_mfa_level2()
      and (
        public.has_permission('moderation.view')
        or public.has_permission('moderation.manage')
      )
  )
);

drop policy if exists "discord ticket participants managed by moderators" on public.discord_ticket_participants;
create policy "discord ticket participants managed by moderators"
on public.discord_ticket_participants for all
to authenticated
using (public.has_mfa_level2() and public.has_permission('moderation.manage'))
with check (public.has_mfa_level2() and public.has_permission('moderation.manage'));

drop policy if exists "discord ticket evidence visible to moderators" on public.discord_ticket_evidence;
create policy "discord ticket evidence visible to moderators"
on public.discord_ticket_evidence for select
to authenticated
using (
  exists (
    select 1
    from public.discord_tickets ticket
    where ticket.id = discord_ticket_evidence.ticket_id
      and public.has_mfa_level2()
      and (
        public.has_permission('moderation.view')
        or public.has_permission('moderation.manage')
      )
  )
);

drop policy if exists "discord ticket evidence managed by moderators" on public.discord_ticket_evidence;
create policy "discord ticket evidence managed by moderators"
on public.discord_ticket_evidence for all
to authenticated
using (public.has_mfa_level2() and public.has_permission('moderation.manage'))
with check (public.has_mfa_level2() and public.has_permission('moderation.manage'));

drop policy if exists "discord ticket logs visible to moderators" on public.discord_ticket_logs;
create policy "discord ticket logs visible to moderators"
on public.discord_ticket_logs for select
to authenticated
using (
  ticket_id is null
  or exists (
    select 1
    from public.discord_tickets ticket
    where ticket.id = discord_ticket_logs.ticket_id
      and public.has_mfa_level2()
      and (
        public.has_permission('moderation.view')
        or public.has_permission('moderation.manage')
      )
  )
);

drop policy if exists "discord ticket logs inserted by moderators" on public.discord_ticket_logs;
create policy "discord ticket logs inserted by moderators"
on public.discord_ticket_logs for insert
to authenticated
with check (public.has_mfa_level2() and public.has_permission('moderation.manage'));

drop policy if exists "member image requests visible to moderators" on public.member_file_image_requests;
create policy "member image requests visible to moderators"
on public.member_file_image_requests for select
to authenticated
using (
  public.has_mfa_level2()
  and (
    public.has_permission('members.view')
    or public.has_permission('members.edit')
    or public.has_permission('moderation.manage')
  )
);

drop policy if exists "member image requests managed by moderators" on public.member_file_image_requests;
create policy "member image requests managed by moderators"
on public.member_file_image_requests for all
to authenticated
using (
  public.has_mfa_level2()
  and (
    public.has_permission('members.edit')
    or public.has_permission('moderation.manage')
  )
)
with check (
  public.has_mfa_level2()
  and (
    public.has_permission('members.edit')
    or public.has_permission('moderation.manage')
  )
);

drop policy if exists "member image logs visible to moderators" on public.member_file_image_request_logs;
create policy "member image logs visible to moderators"
on public.member_file_image_request_logs for select
to authenticated
using (
  exists (
    select 1
    from public.member_file_image_requests request
    where request.id = member_file_image_request_logs.request_id
      and public.has_mfa_level2()
      and (
        public.has_permission('members.view')
        or public.has_permission('members.edit')
        or public.has_permission('moderation.manage')
      )
  )
);

drop policy if exists "member image logs inserted by moderators" on public.member_file_image_request_logs;
create policy "member image logs inserted by moderators"
on public.member_file_image_request_logs for insert
to authenticated
with check (
  public.has_mfa_level2()
  and (
    public.has_permission('members.edit')
    or public.has_permission('moderation.manage')
  )
);

revoke all on table public.discord_tickets from anon;
revoke all on table public.discord_ticket_participants from anon;
revoke all on table public.discord_ticket_evidence from anon;
revoke all on table public.discord_ticket_logs from anon;
revoke all on table public.member_file_image_requests from anon;
revoke all on table public.member_file_image_request_logs from anon;
revoke all on sequence public.discord_ticket_number_seq from anon;

grant select, insert, update, delete on table public.discord_tickets to authenticated;
grant select, insert, update, delete on table public.discord_ticket_participants to authenticated;
grant select, insert, update, delete on table public.discord_ticket_evidence to authenticated;
grant select, insert on table public.discord_ticket_logs to authenticated;
grant select, insert, update, delete on table public.member_file_image_requests to authenticated;
grant select, insert on table public.member_file_image_request_logs to authenticated;
grant usage, select on sequence public.discord_ticket_number_seq to authenticated;
