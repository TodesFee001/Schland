create extension if not exists pgcrypto;

create type public.user_status as enum ('active', 'disabled');
create type public.member_status as enum ('active', 'review', 'archived');
create type public.member_log_action as enum (
  'search',
  'open',
  'view',
  'edit',
  'clear_field',
  'link_file',
  'unlink_file',
  'open_linked_file',
  'export',
  'failed_access'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text unique,
  two_factor_enabled boolean not null default false,
  status public.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.file_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.file_categories(id) on delete cascade,
  parent_folder_id uuid references public.folders(id) on delete cascade,
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, parent_folder_id, name)
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  original_filename text not null,
  file_type text not null,
  file_size bigint not null check (file_size >= 0),
  storage_path text not null unique,
  category_id uuid references public.file_categories(id) on delete set null,
  folder_id uuid references public.folders(id) on delete set null,
  description text,
  tags text[] not null default '{}',
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  image_file_id uuid references public.files(id) on delete set null,
  name text not null,
  age integer check (age is null or age >= 0),
  residence text,
  profession text,
  phone text,
  discord_id text unique,
  discord_username text,
  discord_display_name text,
  invited_by_member_id uuid references public.members(id) on delete set null,
  instagram text,
  snapchat text,
  tiktok text,
  stream text,
  ubisoft text,
  ea text,
  extra_socials jsonb not null default '{}',
  status public.member_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.discord_roles (
  id uuid primary key default gen_random_uuid(),
  discord_role_id text not null unique,
  role_name text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.member_discord_roles (
  member_id uuid not null references public.members(id) on delete cascade,
  discord_role_id uuid not null references public.discord_roles(id) on delete cascade,
  synced_at timestamptz not null default now(),
  primary key (member_id, discord_role_id)
);

create table public.message_activity_monthly (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  year integer not null check (year >= 2020),
  month integer not null check (month between 1 and 12),
  message_count integer not null default 0 check (message_count >= 0),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, year, month)
);

create table public.voice_activity_monthly (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  year integer not null check (year >= 2020),
  month integer not null check (month between 1 and 12),
  voice_minutes integer not null default 0 check (voice_minutes >= 0),
  last_voice_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, year, month)
);

create table public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  channel_id text not null,
  channel_name text,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  created_at timestamptz not null default now()
);

create table public.member_files (
  member_id uuid not null references public.members(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  relation_type text not null default 'linked',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (member_id, file_id)
);

create table public.folder_permissions (
  folder_id uuid not null references public.folders(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  can_view boolean not null default false,
  can_open boolean not null default false,
  can_upload boolean not null default false,
  can_download boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_manage_permissions boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (folder_id, role_id)
);

create table public.member_case_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  username text,
  member_id uuid references public.members(id) on delete set null,
  action public.member_log_action not null,
  reason text,
  field_name text,
  old_value text,
  new_value text,
  related_file_id uuid references public.files(id) on delete set null,
  success boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'discord',
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger roles_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

create trigger file_categories_updated_at
before update on public.file_categories
for each row execute function public.set_updated_at();

create trigger folders_updated_at
before update on public.folders
for each row execute function public.set_updated_at();

create trigger files_updated_at
before update on public.files
for each row execute function public.set_updated_at();

create trigger members_updated_at
before update on public.members
for each row execute function public.set_updated_at();

create trigger discord_roles_updated_at
before update on public.discord_roles
for each row execute function public.set_updated_at();

create trigger message_activity_monthly_updated_at
before update on public.message_activity_monthly
for each row execute function public.set_updated_at();

create trigger voice_activity_monthly_updated_at
before update on public.voice_activity_monthly
for each row execute function public.set_updated_at();

create trigger folder_permissions_updated_at
before update on public.folder_permissions
for each row execute function public.set_updated_at();

create or replace function public.has_permission(required_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions perm on perm.id = rp.permission_id
    join public.roles r on r.id = ur.role_id
    where p.id = auth.uid()
      and p.status = 'active'
      and r.active = true
      and perm.permission_key = required_key
  );
$$;

create or replace function public.has_mfa_level2()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create or replace function public.open_member_case(
  p_member_id uuid,
  p_reason text
)
returns public.members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
  v_username text;
begin
  select display_name into v_username from public.profiles where id = auth.uid();

  if length(trim(coalesce(p_reason, ''))) < 8 then
    insert into public.member_case_logs (
      user_id, username, member_id, action, reason, success
    )
    values (
      auth.uid(), v_username, p_member_id, 'failed_access', p_reason, false
    );
    raise exception 'member case access reason is required';
  end if;

  if not public.has_permission('members.open') or not public.has_mfa_level2() then
    insert into public.member_case_logs (
      user_id, username, member_id, action, reason, success
    )
    values (
      auth.uid(), v_username, p_member_id, 'failed_access', p_reason, false
    );
    raise exception 'member case access denied';
  end if;

  select * into v_member from public.members where id = p_member_id;

  if v_member.id is null then
    insert into public.member_case_logs (
      user_id, username, member_id, action, reason, success
    )
    values (
      auth.uid(), v_username, p_member_id, 'failed_access', p_reason, false
    );
    raise exception 'member case not found';
  end if;

  insert into public.member_case_logs (
    user_id, username, member_id, action, reason, success
  )
  values (
    auth.uid(), v_username, p_member_id, 'open', p_reason, true
  );

  return v_member;
end;
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    email,
    status
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(coalesce(new.email, 'benutzer'), '@', 1)
    ),
    new.email,
    'active'
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

create trigger auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

create or replace function public.mark_own_two_factor_enabled()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set two_factor_enabled = true,
      updated_at = now()
  where id = auth.uid();
$$;

grant execute on function public.mark_own_two_factor_enabled() to authenticated;

create or replace function public.assign_administrator_by_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role_id uuid;
begin
  select id into v_user_id
  from public.profiles
  where lower(email) = lower(p_email)
  limit 1;

  if v_user_id is null then
    raise exception 'profile not found for email %', p_email;
  end if;

  select id into v_role_id
  from public.roles
  where role_key = 'administrator'
  limit 1;

  if v_role_id is null then
    raise exception 'administrator role not found';
  end if;

  insert into public.user_roles (user_id, role_id)
  values (v_user_id, v_role_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.assign_administrator_by_email(text) from public;
revoke all on function public.assign_administrator_by_email(text) from anon;
revoke all on function public.assign_administrator_by_email(text) from authenticated;

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.file_categories enable row level security;
alter table public.folders enable row level security;
alter table public.files enable row level security;
alter table public.members enable row level security;
alter table public.discord_roles enable row level security;
alter table public.member_discord_roles enable row level security;
alter table public.message_activity_monthly enable row level security;
alter table public.voice_activity_monthly enable row level security;
alter table public.voice_sessions enable row level security;
alter table public.member_files enable row level security;
alter table public.folder_permissions enable row level security;
alter table public.member_case_logs enable row level security;
alter table public.sync_runs enable row level security;

create policy "profiles read own or managed"
on public.profiles for select
using (id = auth.uid() or public.has_permission('users.manage'));

create policy "profiles manage"
on public.profiles for all
using (public.has_permission('users.manage'))
with check (public.has_permission('users.manage'));

create policy "roles readable by managers"
on public.roles for select
using (public.has_permission('roles.manage') or public.has_permission('app.enter'));

create policy "roles managed by managers"
on public.roles for all
using (public.has_permission('roles.manage'))
with check (public.has_permission('roles.manage'));

create policy "permissions readable by managers"
on public.permissions for select
using (public.has_permission('roles.manage') or public.has_permission('app.enter'));

create policy "role mappings managed"
on public.user_roles for all
using (public.has_permission('users.manage'))
with check (public.has_permission('users.manage'));

create policy "permission mappings managed"
on public.role_permissions for all
using (public.has_permission('roles.manage'))
with check (public.has_permission('roles.manage'));

create policy "categories visible to app users"
on public.file_categories for select
using (active = true and public.has_permission('files.view'));

create policy "categories managed"
on public.file_categories for all
using (public.has_permission('files.manage'))
with check (public.has_permission('files.manage'));

create policy "folders visible by file permission"
on public.folders for select
using (public.has_permission('files.view'));

create policy "folders managed"
on public.folders for all
using (public.has_permission('folders.manage'))
with check (public.has_permission('folders.manage'));

create policy "files visible by file permission"
on public.files for select
using (public.has_permission('files.view'));

create policy "files inserted by upload permission"
on public.files for insert
with check (public.has_permission('files.upload'));

create policy "files changed by edit permission"
on public.files for update
using (public.has_permission('files.edit'))
with check (public.has_permission('files.edit'));

create policy "files deleted by delete permission"
on public.files for delete
using (public.has_permission('files.delete'));

create policy "members direct read guarded"
on public.members for select
using (public.has_permission('members.open') and public.has_mfa_level2());

create policy "members changed by editors"
on public.members for update
using (public.has_permission('members.edit') and public.has_mfa_level2())
with check (public.has_permission('members.edit') and public.has_mfa_level2());

create policy "discord roles visible with member access"
on public.discord_roles for select
using (public.has_permission('members.open') and public.has_mfa_level2());

create policy "member discord roles visible with member access"
on public.member_discord_roles for select
using (public.has_permission('members.open') and public.has_mfa_level2());

create policy "activity visible to activity users"
on public.message_activity_monthly for select
using (public.has_permission('activity.view'));

create policy "voice activity visible to activity users"
on public.voice_activity_monthly for select
using (public.has_permission('activity.view'));

create policy "voice sessions visible to activity users"
on public.voice_sessions for select
using (public.has_permission('activity.view'));

create policy "member files visible with member access"
on public.member_files for select
using (public.has_permission('members.open') and public.has_mfa_level2());

create policy "member files managed by editors"
on public.member_files for all
using (public.has_permission('members.edit') and public.has_mfa_level2())
with check (public.has_permission('members.edit') and public.has_mfa_level2());

create policy "folder permissions visible to managers"
on public.folder_permissions for select
using (public.has_permission('folders.manage'));

create policy "folder permissions managed"
on public.folder_permissions for all
using (public.has_permission('folders.manage'))
with check (public.has_permission('folders.manage'));

create policy "member logs visible to member managers"
on public.member_case_logs for select
using (public.has_permission('members.audit'));

create policy "sync visible to sync managers"
on public.sync_runs for select
using (public.has_permission('sync.manage'));

insert into public.roles (role_key, name, description)
values
  ('administrator', 'Administrator', 'Vollzugriff auf Systemverwaltung'),
  ('standard_user', 'Standardbenutzer', 'Grundzugriff auf die Anwendung'),
  ('file_access', 'Dateienzugriff', 'Zugriff auf Datei-Datenbank'),
  ('image_access', 'Bilderzugriff', 'Zugriff auf Bildbereiche'),
  ('investigation_access', 'Ermittlungszugriff', 'Zugriff auf Ermittlungsbereiche'),
  ('member_case_reader', 'Mitgliederakten-Leser', 'Lesender Zugriff auf Mitgliederakten'),
  ('member_case_editor', 'Mitgliederakten-Bearbeiter', 'Bearbeitender Zugriff auf Mitgliederakten')
on conflict (role_key) do nothing;

insert into public.permissions (permission_key, description)
values
  ('app.enter', 'Anwendung betreten'),
  ('files.view', 'Datei-Datenbank anzeigen'),
  ('files.open', 'Datei oeffnen'),
  ('files.upload', 'Datei hochladen'),
  ('files.download', 'Datei herunterladen'),
  ('files.edit', 'Datei bearbeiten'),
  ('files.delete', 'Datei loeschen'),
  ('files.manage', 'Dateien administrieren'),
  ('folders.view', 'Ordner anzeigen'),
  ('folders.manage', 'Ordner und Ordnerrechte verwalten'),
  ('members.search', 'Mitgliederakte suchen'),
  ('members.open', 'Mitgliederakte oeffnen'),
  ('members.edit', 'Mitgliederakte bearbeiten'),
  ('members.export', 'Mitgliederakte exportieren'),
  ('members.audit', 'Mitgliederakten-Protokoll anzeigen'),
  ('roles.manage', 'Rollen verwalten'),
  ('users.manage', 'Benutzer verwalten'),
  ('activity.view', 'Aktivitaetsauswertung anzeigen'),
  ('sync.manage', 'Synchronisation verwalten')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_key = 'administrator'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_key in ('app.enter', 'files.view', 'folders.view')
where r.role_key = 'standard_user'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_key in (
  'app.enter',
  'files.view',
  'files.open',
  'files.download',
  'folders.view'
)
where r.role_key = 'file_access'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_key in (
  'app.enter',
  'members.search',
  'members.open',
  'activity.view'
)
where r.role_key = 'member_case_reader'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_key in (
  'app.enter',
  'members.search',
  'members.open',
  'members.edit',
  'members.export',
  'members.audit',
  'activity.view'
)
where r.role_key = 'member_case_editor'
on conflict do nothing;

insert into public.file_categories (name, description, sort_order)
values
  ('Mitteilungen', 'Interne Mitteilungen und Rundschreiben', 10),
  ('Ermittlungen', 'Ermittlungsbezogene Dokumente', 20),
  ('Gesetzgebung', 'Regeln, Gesetzgebung und Richtlinien', 30),
  ('Platzhalter 1', 'Frei belegbare Kategorie', 40),
  ('Platzhalter 2', 'Frei belegbare Kategorie', 50),
  ('Platzhalter 3', 'Frei belegbare Kategorie', 60),
  ('Platzhalter 4', 'Frei belegbare Kategorie', 70),
  ('Platzhalter 5', 'Frei belegbare Kategorie', 80)
on conflict (name) do nothing;
