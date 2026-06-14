create sequence if not exists public.moderation_advice_case_number_seq;

create table if not exists public.moderation_advice_cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique default (
    'SANK-' ||
    to_char(now() at time zone 'Europe/Berlin', 'YYYYMMDD') ||
    '-' ||
    lpad(nextval('public.moderation_advice_case_number_seq')::text, 4, '0')
  ),
  title text not null default 'Neue Beratung',
  status text not null default 'draft',
  target_member_id uuid references public.members(id) on delete set null,
  target_discord_user_id text,
  target_discord_username text,
  submitted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  incident_at timestamptz,
  situation_text text not null default '',
  behavior_summary text not null default '',
  affected_people text not null default '',
  desired_outcome text not null default '',
  internal_notes text not null default '',
  prior_history_snapshot jsonb not null default '{}',
  legal_basis_snapshot jsonb not null default '{}',
  evidence_summary jsonb not null default '{}',
  ai_input jsonb not null default '{}',
  ai_output jsonb not null default '{}',
  model_provider text,
  model_name text,
  recommended_action text,
  recommended_event_type text,
  recommended_reason text,
  confidence numeric(4, 3),
  severity_score integer,
  execution_event_id uuid unique references public.discord_moderation_events(id) on delete set null,
  executed_by uuid references public.profiles(id) on delete set null,
  executed_at timestamptz,
  archived_at timestamptz,
  constraint moderation_advice_cases_number_check
    check (case_number ~ '^SANK-[0-9]{8}-[0-9]{4,}$'),
  constraint moderation_advice_cases_status_check
    check (status in ('draft', 'analyzing', 'advice_ready', 'saved', 'queued', 'executed', 'failed', 'cancelled')),
  constraint moderation_advice_cases_recommendation_check
    check (recommended_action is null or recommended_action in ('no_action', 'manual_review', 'warn', 'kick', 'ban')),
  constraint moderation_advice_cases_event_type_check
    check (recommended_event_type is null or recommended_event_type in ('warn', 'kick', 'ban')),
  constraint moderation_advice_cases_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint moderation_advice_cases_severity_check
    check (severity_score is null or (severity_score >= 0 and severity_score <= 100)),
  constraint moderation_advice_cases_target_check
    check (
      target_member_id is not null
      or nullif(trim(coalesce(target_discord_user_id, '')), '') is not null
      or nullif(trim(coalesce(target_discord_username, '')), '') is not null
    )
);

create table if not exists public.moderation_advice_evidence (
  id uuid primary key default gen_random_uuid(),
  advice_case_id uuid not null references public.moderation_advice_cases(id) on delete cascade,
  file_id uuid references public.files(id) on delete set null,
  evidence_type text not null,
  label text not null default '',
  description text not null default '',
  external_url text,
  metadata jsonb not null default '{}',
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint moderation_advice_evidence_type_check
    check (evidence_type in ('screenshot', 'file', 'message_link', 'note', 'other'))
);

create table if not exists public.moderation_advice_logs (
  id uuid primary key default gen_random_uuid(),
  advice_case_id uuid not null references public.moderation_advice_cases(id) on delete cascade,
  action text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists moderation_advice_cases_target_member_idx
on public.moderation_advice_cases (target_member_id);

create index if not exists moderation_advice_cases_discord_user_idx
on public.moderation_advice_cases (target_discord_user_id);

create index if not exists moderation_advice_cases_status_idx
on public.moderation_advice_cases (status, updated_at desc);

create index if not exists moderation_advice_cases_created_at_idx
on public.moderation_advice_cases (created_at desc);

create index if not exists moderation_advice_evidence_case_idx
on public.moderation_advice_evidence (advice_case_id, created_at);

create index if not exists moderation_advice_logs_case_idx
on public.moderation_advice_logs (advice_case_id, created_at desc);

create unique index if not exists discord_moderation_events_ai_advice_case_unique
on public.discord_moderation_events ((metadata->>'adviceCaseId'))
where source = 'schland-ai-advice-command' and metadata ? 'adviceCaseId';

drop trigger if exists moderation_advice_cases_updated_at on public.moderation_advice_cases;
create trigger moderation_advice_cases_updated_at
before update on public.moderation_advice_cases
for each row execute function public.set_updated_at();

alter table public.moderation_advice_cases enable row level security;
alter table public.moderation_advice_evidence enable row level security;
alter table public.moderation_advice_logs enable row level security;

drop policy if exists "moderation advice visible to moderators" on public.moderation_advice_cases;
create policy "moderation advice visible to moderators"
on public.moderation_advice_cases for select
to authenticated
using (
  public.has_mfa_level2()
  and (
    public.has_permission('moderation.view')
    or public.has_permission('moderation.manage')
  )
);

drop policy if exists "moderation advice inserted by managers" on public.moderation_advice_cases;
create policy "moderation advice inserted by managers"
on public.moderation_advice_cases for insert
to authenticated
with check (public.has_permission('moderation.manage') and public.has_mfa_level2());

drop policy if exists "moderation advice updated by managers" on public.moderation_advice_cases;
create policy "moderation advice updated by managers"
on public.moderation_advice_cases for update
to authenticated
using (public.has_permission('moderation.manage') and public.has_mfa_level2())
with check (public.has_permission('moderation.manage') and public.has_mfa_level2());

drop policy if exists "moderation advice deleted by managers" on public.moderation_advice_cases;
create policy "moderation advice deleted by managers"
on public.moderation_advice_cases for delete
to authenticated
using (public.has_permission('moderation.manage') and public.has_mfa_level2());

drop policy if exists "moderation advice evidence visible to moderators" on public.moderation_advice_evidence;
create policy "moderation advice evidence visible to moderators"
on public.moderation_advice_evidence for select
to authenticated
using (
  exists (
    select 1
    from public.moderation_advice_cases advice_case
    where advice_case.id = moderation_advice_evidence.advice_case_id
      and public.has_mfa_level2()
      and (
        public.has_permission('moderation.view')
        or public.has_permission('moderation.manage')
      )
  )
);

drop policy if exists "moderation advice evidence managed by managers" on public.moderation_advice_evidence;
create policy "moderation advice evidence managed by managers"
on public.moderation_advice_evidence for all
to authenticated
using (public.has_permission('moderation.manage') and public.has_mfa_level2())
with check (public.has_permission('moderation.manage') and public.has_mfa_level2());

drop policy if exists "moderation advice logs visible to moderators" on public.moderation_advice_logs;
create policy "moderation advice logs visible to moderators"
on public.moderation_advice_logs for select
to authenticated
using (
  exists (
    select 1
    from public.moderation_advice_cases advice_case
    where advice_case.id = moderation_advice_logs.advice_case_id
      and public.has_mfa_level2()
      and (
        public.has_permission('moderation.view')
        or public.has_permission('moderation.manage')
      )
  )
);

drop policy if exists "moderation advice logs inserted by managers" on public.moderation_advice_logs;
create policy "moderation advice logs inserted by managers"
on public.moderation_advice_logs for insert
to authenticated
with check (public.has_permission('moderation.manage') and public.has_mfa_level2());

revoke all on table public.moderation_advice_cases from anon;
revoke all on table public.moderation_advice_evidence from anon;
revoke all on table public.moderation_advice_logs from anon;
revoke all on sequence public.moderation_advice_case_number_seq from anon;

grant select, insert, update, delete on table public.moderation_advice_cases to authenticated;
grant select, insert, update, delete on table public.moderation_advice_evidence to authenticated;
grant select, insert on table public.moderation_advice_logs to authenticated;
grant usage, select on sequence public.moderation_advice_case_number_seq to authenticated;
