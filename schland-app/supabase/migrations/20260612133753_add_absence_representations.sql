create table public.representation_ministry_roles (
  id uuid primary key default gen_random_uuid(),
  discord_role_id text not null unique check (discord_role_id ~ '^[0-9]{15,25}$'),
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 100 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.representation_eligibilities (
  id uuid primary key default gen_random_uuid(),
  representative_member_id uuid not null references public.members(id) on delete cascade,
  representative_discord_id text not null check (representative_discord_id ~ '^[0-9]{15,25}$'),
  active boolean not null default true,
  priority integer not null default 100 check (priority >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (representative_member_id)
);

create table public.representation_eligibility_ministry_roles (
  eligibility_id uuid not null references public.representation_eligibilities(id) on delete cascade,
  ministry_role_id uuid not null references public.representation_ministry_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (eligibility_id, ministry_role_id)
);

create table public.member_absences (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{15,25}$'),
  reason text not null check (length(trim(reason)) >= 8),
  status text not null default 'active' check (status in ('active', 'ending', 'ended', 'failed')),
  expected_return_at timestamptz,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_by_name text,
  ended_by uuid references public.profiles(id) on delete set null,
  ended_by_name text,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.member_absence_representations (
  id uuid primary key default gen_random_uuid(),
  absence_id uuid not null references public.member_absences(id) on delete cascade,
  represented_member_id uuid not null references public.members(id) on delete restrict,
  represented_discord_id text not null check (represented_discord_id ~ '^[0-9]{15,25}$'),
  representative_member_id uuid references public.members(id) on delete set null,
  representative_discord_id text check (representative_discord_id is null or representative_discord_id ~ '^[0-9]{15,25}$'),
  ministry_role_id uuid not null references public.representation_ministry_roles(id) on delete restrict,
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{15,25}$'),
  ministry_role_name text not null,
  status text not null default 'pending' check (status in ('pending', 'assigning', 'active', 'ending', 'ended', 'failed', 'skipped')),
  representative_had_role_before boolean not null default false,
  role_was_assigned_automatically boolean not null default false,
  assigned_at timestamptz,
  removed_at timestamptz,
  bot_error text,
  bot_last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (absence_id, ministry_role_id)
);

create index idx_representation_ministry_roles_active
on public.representation_ministry_roles(active, sort_order, name);

create index idx_representation_eligibilities_member
on public.representation_eligibilities(representative_member_id);

create index idx_representation_eligibilities_discord
on public.representation_eligibilities(representative_discord_id);

create index idx_representation_eligibility_roles_role
on public.representation_eligibility_ministry_roles(ministry_role_id);

create index idx_member_absences_member_status
on public.member_absences(member_id, status);

create unique index idx_member_absences_one_active_per_member
on public.member_absences(member_id)
where status in ('active', 'ending');

create index idx_member_absence_representations_status
on public.member_absence_representations(status, created_at);

create index idx_member_absence_representations_rep_role_active
on public.member_absence_representations(representative_discord_id, discord_role_id)
where status in ('pending', 'assigning', 'active', 'ending');

create trigger representation_ministry_roles_updated_at
before update on public.representation_ministry_roles
for each row execute function public.set_updated_at();

create trigger representation_eligibilities_updated_at
before update on public.representation_eligibilities
for each row execute function public.set_updated_at();

create trigger member_absences_updated_at
before update on public.member_absences
for each row execute function public.set_updated_at();

create trigger member_absence_representations_updated_at
before update on public.member_absence_representations
for each row execute function public.set_updated_at();

alter table public.representation_ministry_roles enable row level security;
alter table public.representation_eligibilities enable row level security;
alter table public.representation_eligibility_ministry_roles enable row level security;
alter table public.member_absences enable row level security;
alter table public.member_absence_representations enable row level security;

create policy "representation ministry roles visible"
on public.representation_ministry_roles for select
to authenticated
using (public.has_permission('app.enter'));

create policy "representation ministry roles managed"
on public.representation_ministry_roles for all
to authenticated
using (public.has_permission('representations.manage') and public.has_mfa_level2())
with check (public.has_permission('representations.manage') and public.has_mfa_level2());

create policy "representation eligibilities visible"
on public.representation_eligibilities for select
to authenticated
using (public.has_permission('app.enter'));

create policy "representation eligibilities managed"
on public.representation_eligibilities for all
to authenticated
using (public.has_permission('representations.manage') and public.has_mfa_level2())
with check (public.has_permission('representations.manage') and public.has_mfa_level2());

create policy "representation eligibility roles visible"
on public.representation_eligibility_ministry_roles for select
to authenticated
using (public.has_permission('app.enter'));

create policy "representation eligibility roles managed"
on public.representation_eligibility_ministry_roles for all
to authenticated
using (public.has_permission('representations.manage') and public.has_mfa_level2())
with check (public.has_permission('representations.manage') and public.has_mfa_level2());

create policy "member absences visible"
on public.member_absences for select
to authenticated
using (public.has_permission('app.enter'));

create policy "member absences managed"
on public.member_absences for all
to authenticated
using (
  (public.has_permission('app.enter') or public.has_permission('absences.manage'))
  and public.has_mfa_level2()
)
with check (
  (public.has_permission('app.enter') or public.has_permission('absences.manage'))
  and public.has_mfa_level2()
);

create policy "member absence representations visible"
on public.member_absence_representations for select
to authenticated
using (public.has_permission('app.enter'));

create policy "member absence representations managed"
on public.member_absence_representations for all
to authenticated
using (
  (public.has_permission('absences.manage') or public.has_permission('representations.manage'))
  and public.has_mfa_level2()
)
with check (
  (public.has_permission('absences.manage') or public.has_permission('representations.manage'))
  and public.has_mfa_level2()
);

insert into public.permissions (permission_key, description)
values
  ('absences.view', 'Abmeldungen und Amtsvertretungen anzeigen'),
  ('absences.manage', 'Abmeldungen beenden und Vertretungen steuern'),
  ('representations.manage', 'Amtsrollen und Vertretungsberechtigungen verwalten')
on conflict (permission_key) do update
set description = excluded.description;

with role_permission_matrix(role_key, permission_key) as (
  values
    ('root_owner', 'absences.view'),
    ('root_owner', 'absences.manage'),
    ('root_owner', 'representations.manage'),
    ('platform_admin', 'absences.view'),
    ('platform_admin', 'absences.manage'),
    ('platform_admin', 'representations.manage'),
    ('federal_chancellor', 'absences.view'),
    ('federal_chancellor', 'absences.manage'),
    ('federal_chancellor', 'representations.manage'),
    ('federal_vice_chancellor', 'absences.view'),
    ('federal_vice_chancellor', 'absences.manage'),
    ('federal_vice_chancellor', 'representations.manage'),
    ('interior_ministry', 'absences.view'),
    ('interior_ministry', 'absences.manage'),
    ('interior_ministry', 'representations.manage'),
    ('read_only_auditor', 'absences.view'),
    ('sync_bot_manager', 'absences.view'),
    ('sync_bot_manager', 'representations.manage')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from role_permission_matrix rpm
join public.roles r on r.role_key = rpm.role_key
join public.permissions p on p.permission_key = rpm.permission_key
on conflict do nothing;
