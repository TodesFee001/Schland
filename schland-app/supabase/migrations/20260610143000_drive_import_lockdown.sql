alter table public.files
  add column if not exists external_url text,
  add column if not exists source text not null default 'supabase',
  add column if not exists source_id text,
  add column if not exists source_mime_type text;

create unique index if not exists idx_files_source_source_id
on public.files (source, source_id)
where source_id is not null;

insert into public.permissions (permission_key, description)
values
  ('lockdown.view', 'Lockdown-Status anzeigen'),
  ('lockdown.manage', 'Lockdown aktivieren und deaktivieren')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_key in ('lockdown.view', 'lockdown.manage')
where r.role_key in ('platform_admin')
on conflict do nothing;

create table if not exists public.lockdown_state (
  id boolean primary key default true check (id),
  active boolean not null default false,
  activated_at timestamptz,
  activated_by uuid references public.profiles(id) on delete set null,
  activated_by_name text,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles(id) on delete set null,
  deactivated_by_name text,
  reason text,
  emergency_code_hash text,
  bot_status text not null default 'idle',
  bot_error text,
  important_channel_ids text[] not null default '{}',
  metadata jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

insert into public.lockdown_state (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.lockdown_access_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz
);

create index if not exists idx_lockdown_access_sessions_user_expires
on public.lockdown_access_sessions (user_id, expires_at desc);

create table if not exists public.discord_lockdown_commands (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('activate', 'deactivate')),
  status text not null default 'pending' check (status in ('pending', 'running', 'executed', 'failed')),
  reason text,
  emergency_code text,
  triggered_by uuid references public.profiles(id) on delete set null,
  triggered_by_name text,
  recipient_discord_ids text[] not null default '{}',
  recipient_usernames text[] not null default '{}',
  important_channel_ids text[] not null default '{}',
  bot_error text,
  metadata jsonb not null default '{}',
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_discord_lockdown_commands_status_created
on public.discord_lockdown_commands (status, created_at);

alter table public.lockdown_state enable row level security;
alter table public.lockdown_access_sessions enable row level security;
alter table public.discord_lockdown_commands enable row level security;

drop policy if exists "lockdown status visible" on public.lockdown_state;
create policy "lockdown status visible"
on public.lockdown_state for select
to authenticated
using (public.has_permission('lockdown.view') or public.has_permission('lockdown.manage'));

drop policy if exists "lockdown sessions own" on public.lockdown_access_sessions;
create policy "lockdown sessions own"
on public.lockdown_access_sessions for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "lockdown commands visible to managers" on public.discord_lockdown_commands;
create policy "lockdown commands visible to managers"
on public.discord_lockdown_commands for select
to authenticated
using (public.has_permission('lockdown.manage'));

drop trigger if exists lockdown_state_updated_at on public.lockdown_state;
create trigger lockdown_state_updated_at
before update on public.lockdown_state
for each row execute function public.set_updated_at();

drop trigger if exists discord_lockdown_commands_updated_at on public.discord_lockdown_commands;
create trigger discord_lockdown_commands_updated_at
before update on public.discord_lockdown_commands
for each row execute function public.set_updated_at();

create or replace function public.get_lockdown_status()
returns table (
  active boolean,
  activated_at timestamptz,
  activated_by_name text,
  reason text,
  bot_status text,
  bot_error text,
  can_manage boolean,
  important_channel_ids text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ls.active,
    ls.activated_at,
    ls.activated_by_name,
    ls.reason,
    ls.bot_status,
    ls.bot_error,
    public.has_permission('lockdown.manage') and public.has_mfa_level2() as can_manage,
    ls.important_channel_ids
  from public.lockdown_state ls
  where ls.id = true;
$$;

create or replace function public.generate_lockdown_code()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select
    substring(v from 1 for 6) || '-' ||
    substring(v from 7 for 6) || '-' ||
    substring(v from 13 for 6)
  from (select upper(encode(extensions.gen_random_bytes(9), 'hex')) as v) code;
$$;

create or replace function public.activate_system_lockdown(
  p_reason text,
  p_recipient_discord_ids text[] default '{}'::text[],
  p_recipient_usernames text[] default array['losoverdrive']::text[],
  p_important_channel_ids text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_code text;
  v_command_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null then
    raise exception 'lockdown denied';
  end if;

  if not public.has_permission('lockdown.manage') or not public.has_mfa_level2() then
    raise exception 'lockdown denied';
  end if;

  if v_reason is null or length(v_reason) < 8 then
    raise exception 'lockdown reason required';
  end if;

  select coalesce(display_name, username, email, v_actor_id::text)
  into v_actor_name
  from public.profiles
  where id = v_actor_id;

  v_code := public.generate_lockdown_code();

  update public.lockdown_state
  set
    active = true,
    activated_at = now(),
    activated_by = v_actor_id,
    activated_by_name = v_actor_name,
    deactivated_at = null,
    deactivated_by = null,
    deactivated_by_name = null,
    reason = v_reason,
    emergency_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf', 12)),
    bot_status = 'pending',
    bot_error = null,
    important_channel_ids = coalesce(p_important_channel_ids, '{}'::text[]),
    metadata = jsonb_build_object('lastCommand', 'activate')
  where id = true;

  insert into public.discord_lockdown_commands (
    action,
    reason,
    emergency_code,
    triggered_by,
    triggered_by_name,
    recipient_discord_ids,
    recipient_usernames,
    important_channel_ids
  )
  values (
    'activate',
    v_reason,
    v_code,
    v_actor_id,
    v_actor_name,
    coalesce(p_recipient_discord_ids, '{}'::text[]),
    coalesce(p_recipient_usernames, array['losoverdrive']::text[]),
    coalesce(p_important_channel_ids, '{}'::text[])
  )
  returning id into v_command_id;

  insert into public.systemprotokoll (benutzer_id, aktion, bereich, details)
  values (v_actor_id, 'lockdown_activated', 'security', concat('command=', v_command_id::text, '; reason=', v_reason));

  return v_command_id;
end;
$$;

create or replace function public.deactivate_system_lockdown(p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_command_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null then
    raise exception 'lockdown denied';
  end if;

  if not public.has_permission('lockdown.manage') or not public.has_mfa_level2() then
    raise exception 'lockdown denied';
  end if;

  if v_reason is null or length(v_reason) < 8 then
    raise exception 'lockdown reason required';
  end if;

  select coalesce(display_name, username, email, v_actor_id::text)
  into v_actor_name
  from public.profiles
  where id = v_actor_id;

  update public.lockdown_state
  set
    active = false,
    deactivated_at = now(),
    deactivated_by = v_actor_id,
    deactivated_by_name = v_actor_name,
    emergency_code_hash = null,
    bot_status = 'restore_pending',
    bot_error = null,
    metadata = metadata || jsonb_build_object('lastCommand', 'deactivate')
  where id = true;

  insert into public.discord_lockdown_commands (
    action,
    reason,
    triggered_by,
    triggered_by_name
  )
  values ('deactivate', v_reason, v_actor_id, v_actor_name)
  returning id into v_command_id;

  insert into public.systemprotokoll (benutzer_id, aktion, bereich, details)
  values (v_actor_id, 'lockdown_deactivated', 'security', concat('command=', v_command_id::text, '; reason=', v_reason));

  return v_command_id;
end;
$$;

create or replace function public.claim_lockdown_emergency_access(
  p_code text,
  p_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := nullif(trim(coalesce(p_code, '')), '');
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_code_hash text;
begin
  if v_user_id is null then
    raise exception 'lockdown emergency denied';
  end if;

  select emergency_code_hash
  into v_code_hash
  from public.lockdown_state
  where id = true
    and active = true;

  if v_code_hash is null then
    return true;
  end if;

  if v_code is null or v_token is null or extensions.crypt(v_code, v_code_hash) <> v_code_hash then
    raise exception 'lockdown emergency denied';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_user_id
      and status = 'active'
  ) then
    raise exception 'lockdown emergency denied';
  end if;

  insert into public.lockdown_access_sessions (user_id, token_hash, expires_at)
  values (v_user_id, extensions.crypt(v_token, extensions.gen_salt('bf', 10)), now() + interval '45 minutes');

  return true;
end;
$$;

create or replace function public.is_lockdown_session_valid(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_active boolean;
begin
  select active into v_active from public.lockdown_state where id = true;

  if v_active is not true then
    return true;
  end if;

  if v_user_id is null or v_token is null then
    return false;
  end if;

  update public.lockdown_access_sessions
  set last_used_at = now()
  where user_id = v_user_id
    and expires_at > now()
    and extensions.crypt(v_token, token_hash) = token_hash;

  return found;
end;
$$;

revoke all on function public.get_lockdown_status() from public;
grant execute on function public.get_lockdown_status() to anon, authenticated;

revoke all on function public.generate_lockdown_code() from public;
revoke all on function public.generate_lockdown_code() from anon;
revoke all on function public.generate_lockdown_code() from authenticated;

revoke all on function public.activate_system_lockdown(text, text[], text[], text[]) from public;
grant execute on function public.activate_system_lockdown(text, text[], text[], text[]) to authenticated;

revoke all on function public.deactivate_system_lockdown(text) from public;
grant execute on function public.deactivate_system_lockdown(text) to authenticated;

revoke all on function public.claim_lockdown_emergency_access(text, text) from public;
grant execute on function public.claim_lockdown_emergency_access(text, text) to authenticated;

revoke all on function public.is_lockdown_session_valid(text) from public;
grant execute on function public.is_lockdown_session_valid(text) to authenticated;

create or replace function pg_temp.ensure_drive_category(
  p_name text,
  p_description text,
  p_sort_order integer
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.file_categories (name, description, sort_order, active)
  values (p_name, p_description, p_sort_order, true)
  on conflict (name) do update
  set
    description = excluded.description,
    sort_order = excluded.sort_order,
    active = true,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function pg_temp.ensure_drive_folder(
  p_category_id uuid,
  p_parent_folder_id uuid,
  p_name text
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id
  into v_id
  from public.folders
  where category_id = p_category_id
    and parent_folder_id is not distinct from p_parent_folder_id
    and name = p_name
  limit 1;

  if v_id is null then
    insert into public.folders (category_id, parent_folder_id, name)
    values (p_category_id, p_parent_folder_id, p_name)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function pg_temp.import_drive_file(
  p_category_id uuid,
  p_folder_id uuid,
  p_title text,
  p_drive_id text,
  p_url text,
  p_mime_type text,
  p_description text,
  p_tags text[]
)
returns void
language plpgsql
as $$
begin
  insert into public.files (
    filename,
    original_filename,
    file_type,
    file_size,
    storage_path,
    category_id,
    folder_id,
    description,
    tags,
    external_url,
    source,
    source_id,
    source_mime_type
  )
  values (
    regexp_replace(p_title, '[^A-Za-z0-9._-]+', '_', 'g') || '.gdrive',
    p_title,
    coalesce(p_mime_type, 'application/vnd.google-apps.document'),
    0,
    'google-drive/' || p_drive_id,
    p_category_id,
    p_folder_id,
    p_description,
    coalesce(p_tags, '{}'::text[]),
    p_url,
    'google_drive',
    p_drive_id,
    p_mime_type
  )
  on conflict (storage_path) do update
  set
    original_filename = excluded.original_filename,
    file_type = excluded.file_type,
    category_id = excluded.category_id,
    folder_id = excluded.folder_id,
    description = excluded.description,
    tags = excluded.tags,
    external_url = excluded.external_url,
    source = excluded.source,
    source_id = excluded.source_id,
    source_mime_type = excluded.source_mime_type,
    updated_at = now();
end;
$$;

do $$
declare
  v_cat_communications uuid;
  v_cat_investigations uuid;
  v_cat_law uuid;
  v_cat_misc uuid;
  v_cat_special uuid;
  v_cat_admin uuid;
  v_folder_abmeldung uuid;
  v_folder_abmeldung_abgelehnt uuid;
  v_folder_abmeldung_ausstehend uuid;
  v_folder_abmeldung_genehmigt uuid;
  v_folder_admin_general uuid;
  v_folder_admin_roles uuid;
  v_folder_asyl uuid;
  v_folder_asyl_tinny uuid;
  v_folder_entlassungen uuid;
  v_folder_ernennungen uuid;
  v_folder_gba_forms uuid;
  v_folder_invest_approved uuid;
  v_folder_invest_denied uuid;
  v_folder_invest_running uuid;
  v_folder_invest_case_2026_01 uuid;
  v_folder_member_orders uuid;
  v_folder_member_notices uuid;
  v_folder_personnel uuid;
  v_folder_reg_orders uuid;
  v_folder_reg_notices uuid;
begin
  v_cat_communications := pg_temp.ensure_drive_category('Kommunikationswesen', 'Anordnungen und Mitteilungen aus Google Drive.', 15);
  v_cat_investigations := pg_temp.ensure_drive_category('Ermittlungen', 'Ermittlungsbezogene Dokumente und Vorgangsakten.', 20);
  v_cat_law := pg_temp.ensure_drive_category('Gesetzgebung', 'Regeln, Datenschutz, Nutzungsbedingungen und Gesetzestexte.', 30);
  v_cat_admin := pg_temp.ensure_drive_category('Verwaltung', 'Personal, Struktur, Ernennungen, Entlassungen, Asyl und Abmeldungen.', 35);
  v_cat_special := pg_temp.ensure_drive_category('Sonderbereiche', 'Besondere Schutz- und Einzelfallbereiche.', 40);
  v_cat_misc := pg_temp.ensure_drive_category('Ungeordnet', 'Noch nicht final einsortierte Drive-Dokumente.', 90);

  v_folder_reg_orders := pg_temp.ensure_drive_folder(v_cat_communications, null, 'Anordnungen an die Regierung');
  v_folder_reg_notices := pg_temp.ensure_drive_folder(v_cat_communications, null, 'Mitteilungen an die Regierung');
  v_folder_member_orders := pg_temp.ensure_drive_folder(v_cat_communications, null, 'Anordnungen an Mitglieder');
  v_folder_member_notices := pg_temp.ensure_drive_folder(v_cat_communications, null, 'Mitteilungen an Mitglieder');

  v_folder_invest_denied := pg_temp.ensure_drive_folder(v_cat_investigations, null, 'Abgelehnt');
  v_folder_invest_approved := pg_temp.ensure_drive_folder(v_cat_investigations, null, 'Genehmigt');
  v_folder_invest_running := pg_temp.ensure_drive_folder(v_cat_investigations, null, 'Laufende Ermittlungen');
  v_folder_invest_case_2026_01 := pg_temp.ensure_drive_folder(v_cat_investigations, v_folder_invest_running, 'BRS/ERM/01/2026/GBA');
  v_folder_gba_forms := pg_temp.ensure_drive_folder(v_cat_investigations, null, 'Generalbundesanwalt Formulare');

  v_folder_asyl := pg_temp.ensure_drive_folder(v_cat_admin, null, 'Verwaltung Asyl');
  v_folder_asyl_tinny := pg_temp.ensure_drive_folder(v_cat_admin, v_folder_asyl, 'Asyl Tinny - Genehmigt');
  v_folder_abmeldung := pg_temp.ensure_drive_folder(v_cat_admin, null, 'Verwaltung-Abmeldungen');
  v_folder_abmeldung_abgelehnt := pg_temp.ensure_drive_folder(v_cat_admin, v_folder_abmeldung, 'Abmeldung - Abgelehnt oder unvollstaendig');
  v_folder_abmeldung_ausstehend := pg_temp.ensure_drive_folder(v_cat_admin, v_folder_abmeldung, 'Abmeldung - Ausstehend');
  v_folder_abmeldung_genehmigt := pg_temp.ensure_drive_folder(v_cat_admin, v_folder_abmeldung, 'Abmeldung - Genehmigt');
  v_folder_personnel := pg_temp.ensure_drive_folder(v_cat_admin, null, 'Verwaltung - Personalakten');
  v_folder_admin_roles := pg_temp.ensure_drive_folder(v_cat_admin, null, 'Verwaltung - Struktur und Zustaendigkeiten');
  v_folder_entlassungen := pg_temp.ensure_drive_folder(v_cat_admin, null, 'Verwaltung - Entlassungen');
  v_folder_ernennungen := pg_temp.ensure_drive_folder(v_cat_admin, null, 'Verwaltung - Ernennungen');
  v_folder_admin_general := pg_temp.ensure_drive_folder(v_cat_admin, null, 'Verwaltung - Allgemein');

  perform pg_temp.import_drive_file(v_cat_misc, null, 'Az. BRS/Mdl/1.1 Beschluss', '19Ocm1YiIX4ScdklxJCdf0ZedgzuhGjYhNM_J5Y1P-R4', 'https://docs.google.com/document/d/19Ocm1YiIX4ScdklxJCdf0ZedgzuhGjYhNM_J5Y1P-R4/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Ungeordnet.', array['drive','ungeordnet','beschluss']);
  perform pg_temp.import_drive_file(v_cat_misc, null, 'Az. BRS/BMFT/1.1/AB-2025', '1dWbbqousCP2Cc8Tm6GG_qhJIrtHISnPKawVD8fist-4', 'https://docs.google.com/document/d/1dWbbqousCP2Cc8Tm6GG_qhJIrtHISnPKawVD8fist-4/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Ungeordnet.', array['drive','ungeordnet']);
  perform pg_temp.import_drive_file(v_cat_special, null, 'Sonderverordnung ueber den besonderen Schutz der Person Emy', '1_0hTcPDgBK39e7JfY_SYX15MlwMcv86Ws-plXxi-NvE', 'https://docs.google.com/document/d/1_0hTcPDgBK39e7JfY_SYX15MlwMcv86Ws-plXxi-NvE/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Sonderbereiche.', array['drive','sonderbereich','schutz']);
  perform pg_temp.import_drive_file(v_cat_misc, null, 'AZ: BG-Adr-LS/0525-001', '12FsgFWd9Vsra7OllDyhN0k8T9tkLCDpKxfX3nFskZZE', 'https://docs.google.com/document/d/12FsgFWd9Vsra7OllDyhN0k8T9tkLCDpKxfX3nFskZZE/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Ungeordnet.', array['drive','ungeordnet']);

  perform pg_temp.import_drive_file(v_cat_law, null, 'Kurzer Datenschutzhinweis fuer den Server', '1aWCzOUhn6hVpBYHAo8d5FIr3ccmjvZwwWi__GxyZz-k', 'https://docs.google.com/document/d/1aWCzOUhn6hVpBYHAo8d5FIr3ccmjvZwwWi__GxyZz-k/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Gesetzgebung.', array['drive','datenschutz','server']);
  perform pg_temp.import_drive_file(v_cat_law, null, 'Server-Nutzungsbedingungen und Datenschutzhinweis', '1w_ZMx8xCSbE81CFl2NFaw1jXfDoCfC9mR91_XImDB1Q', 'https://docs.google.com/document/d/1w_ZMx8xCSbE81CFl2NFaw1jXfDoCfC9mR91_XImDB1Q/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Gesetzgebung.', array['drive','nutzungsbedingungen','datenschutz']);
  perform pg_temp.import_drive_file(v_cat_law, null, 'Regelwerk Schland 1.0', '1XzgpBgIcZoqFkugGBPwfMCZtG91eAZvCd79k3FEDZBQ', 'https://docs.google.com/document/d/1XzgpBgIcZoqFkugGBPwfMCZtG91eAZvCd79k3FEDZBQ/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Gesetzgebung.', array['drive','regelwerk']);
  perform pg_temp.import_drive_file(v_cat_law, null, 'BRS_StGB 1.0', '1UU0oElWYKlGImZA-L_O5jeKZcfCaJ_1gVnb6IpEC-Vo', 'https://docs.google.com/document/d/1UU0oElWYKlGImZA-L_O5jeKZcfCaJ_1gVnb6IpEC-Vo/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Gesetzgebung.', array['drive','gesetz','stgb']);

  perform pg_temp.import_drive_file(v_cat_investigations, v_folder_gba_forms, 'Schriftliche Beantragung zur Einfuehrung eines Identifikations- und Ordnungssystems fuer Buerger der Bundesrepublik Schland', '17cEQDvqx8IKWGwEuVf6c1EkQxnCQV8__XUvYjRwOquw', 'https://docs.google.com/document/d/17cEQDvqx8IKWGwEuVf6c1EkQxnCQV8__XUvYjRwOquw/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Ermittlungen.', array['drive','ermittlungen','antrag']);
  perform pg_temp.import_drive_file(v_cat_investigations, v_folder_gba_forms, 'Antwortformular des Generalbundesanwalts', '1xXPFhu_LZ4cK9NPbafTKlGRXpMkOd6MLCrkYv_cvERY', 'https://docs.google.com/document/d/1xXPFhu_LZ4cK9NPbafTKlGRXpMkOd6MLCrkYv_cvERY/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Ermittlungen.', array['drive','ermittlungen','gba']);
  perform pg_temp.import_drive_file(v_cat_investigations, v_folder_gba_forms, 'Schriftliche Beauftragung zur Einleitung eines Ermittlungsverfahrens', '10J4Y6Fdvb3YGWBUNlTg_Nd0F_rf4CCvDJkm9f3MBl0o', 'https://docs.google.com/document/d/10J4Y6Fdvb3YGWBUNlTg_Nd0F_rf4CCvDJkm9f3MBl0o/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Ermittlungen.', array['drive','ermittlungen','beauftragung']);

  perform pg_temp.import_drive_file(v_cat_investigations, v_folder_invest_case_2026_01, 'BRS/ERM/09/01/2026/GBA', '1E91yXGVBI33LHoafrT_whj4rPwzxQwWj15pRTk0W8dw', 'https://docs.google.com/document/d/1E91yXGVBI33LHoafrT_whj4rPwzxQwWj15pRTk0W8dw/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Laufende Ermittlungen.', array['drive','ermittlung','2026']);
  perform pg_temp.import_drive_file(v_cat_investigations, v_folder_invest_case_2026_01, 'BRS/ERM/08/01/2026/GBA', '1FyzlO-UhCAfzS3m1GBoicGYhplg2WfMtlS0C4Z3Pggo', 'https://docs.google.com/document/d/1FyzlO-UhCAfzS3m1GBoicGYhplg2WfMtlS0C4Z3Pggo/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Laufende Ermittlungen.', array['drive','ermittlung','2026']);
  perform pg_temp.import_drive_file(v_cat_investigations, v_folder_invest_case_2026_01, 'BRS/ERM/07/01/2026/GBA', '1P5nfSvhjn83zsFux-SdIMFesKz4afMuQYTFGoMfVq2Q', 'https://docs.google.com/document/d/1P5nfSvhjn83zsFux-SdIMFesKz4afMuQYTFGoMfVq2Q/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Laufende Ermittlungen.', array['drive','ermittlung','2026']);
  perform pg_temp.import_drive_file(v_cat_investigations, v_folder_invest_case_2026_01, 'BRS/ERM/06/01/2026/GBA', '198mjW863E3W-y64HPDXUAVMm7xKqj_moK1eZaaUlsDk', 'https://docs.google.com/document/d/198mjW863E3W-y64HPDXUAVMm7xKqj_moK1eZaaUlsDk/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Laufende Ermittlungen.', array['drive','ermittlung','2026']);
  perform pg_temp.import_drive_file(v_cat_investigations, v_folder_invest_case_2026_01, 'BRS/ERM/05/01/2026/GBA', '1f1H_LhHhMENL1g92sAr7Onha2tNCWydxfl8lrwxeva8', 'https://docs.google.com/document/d/1f1H_LhHhMENL1g92sAr7Onha2tNCWydxfl8lrwxeva8/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Laufende Ermittlungen.', array['drive','ermittlung','2026']);
  perform pg_temp.import_drive_file(v_cat_investigations, v_folder_invest_case_2026_01, 'BRS/ERM/04/01/2026/GBA', '1mWAoiJOSmp4WAUwv3LRoOM2DqoJqqS7TL1LId1ttDrg', 'https://docs.google.com/document/d/1mWAoiJOSmp4WAUwv3LRoOM2DqoJqqS7TL1LId1ttDrg/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Laufende Ermittlungen.', array['drive','ermittlung','2026']);
  perform pg_temp.import_drive_file(v_cat_investigations, v_folder_invest_case_2026_01, 'BRS/ERM/03/01/2026/GBA', '1NRmwKx3d82HupT7xwJgVnEBoIw4jzfnxdbpr64jC5yk', 'https://docs.google.com/document/d/1NRmwKx3d82HupT7xwJgVnEBoIw4jzfnxdbpr64jC5yk/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Laufende Ermittlungen.', array['drive','ermittlung','2026']);
  perform pg_temp.import_drive_file(v_cat_investigations, v_folder_invest_case_2026_01, 'BRS/ERM/02/01/2026/GBA', '1DFwEC4L2Yy6vrc7XEQHHIo4JbkJaMtqpuPDgA2CQ6MI', 'https://docs.google.com/document/d/1DFwEC4L2Yy6vrc7XEQHHIo4JbkJaMtqpuPDgA2CQ6MI/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Laufende Ermittlungen.', array['drive','ermittlung','2026']);
  perform pg_temp.import_drive_file(v_cat_investigations, v_folder_invest_case_2026_01, 'BRS/ERM/01/01/2026/GBA', '1oH-C5aM6IVLuF1aT3x-OofC5BdmmA54HvCGXF6lYTy8', 'https://docs.google.com/document/d/1oH-C5aM6IVLuF1aT3x-OofC5BdmmA54HvCGXF6lYTy8/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Laufende Ermittlungen.', array['drive','ermittlung','2026']);

  perform pg_temp.import_drive_file(v_cat_admin, v_folder_asyl_tinny, 'Vorgangsnummer: ASL-T-18102025', '1flTIroM5alMmE3VdHuDLe_Xsj71Eu-Qo2MjOyXRi3Lw', 'https://docs.google.com/document/d/1flTIroM5alMmE3VdHuDLe_Xsj71Eu-Qo2MjOyXRi3Lw/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Verwaltung Asyl.', array['drive','verwaltung','asyl']);
  perform pg_temp.import_drive_file(v_cat_admin, v_folder_personnel, 'Akteneintrag EVA01', '1P9BfB4_VtcCC6xzSAIhPR7P5-qsRoJKnZ9IdvUpReLM', 'https://docs.google.com/document/d/1P9BfB4_VtcCC6xzSAIhPR7P5-qsRoJKnZ9IdvUpReLM/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Personalakten.', array['drive','personalakte']);
  perform pg_temp.import_drive_file(v_cat_admin, v_folder_personnel, 'Michel Klinke', '1kptsaqto-0_DjWQwIOUCOIH1SzCTTetdcFy1hs1pzuI', 'https://docs.google.com/document/d/1kptsaqto-0_DjWQwIOUCOIH1SzCTTetdcFy1hs1pzuI/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Personalakten.', array['drive','personalakte']);
  perform pg_temp.import_drive_file(v_cat_admin, v_folder_personnel, 'Anna Akrapovice', '1FPKqyDFs-bBm-Un1bb61V7H0rqBEQ0U8umIOEXAsyZA', 'https://docs.google.com/document/d/1FPKqyDFs-bBm-Un1bb61V7H0rqBEQ0U8umIOEXAsyZA/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Personalakten.', array['drive','personalakte']);
  perform pg_temp.import_drive_file(v_cat_admin, v_folder_personnel, 'Timo', '1pCS2DDKMXN6cKSS3rDtlmH2zv1npo3yo4QANt0qrBn8', 'https://docs.google.com/document/d/1pCS2DDKMXN6cKSS3rDtlmH2zv1npo3yo4QANt0qrBn8/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Personalakten.', array['drive','personalakte']);
  perform pg_temp.import_drive_file(v_cat_admin, v_folder_personnel, 'Oliver Hartleb', '1EvPixX2mRLSASIhwZi4yvJL6RwwP-jjcNn1n-Uy6ejg', 'https://docs.google.com/document/d/1EvPixX2mRLSASIhwZi4yvJL6RwwP-jjcNn1n-Uy6ejg/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Personalakten.', array['drive','personalakte']);

  perform pg_temp.import_drive_file(v_cat_communications, v_folder_reg_orders, 'BRS/AN/01/01/2026/BK', '1DTbGsQ11clx8ygwdBvKY3dNnpJfxcFBIpe9aujXR-p8', 'https://docs.google.com/document/d/1DTbGsQ11clx8ygwdBvKY3dNnpJfxcFBIpe9aujXR-p8/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Anordnungen an die Regierung.', array['drive','anordnung','regierung']);
  perform pg_temp.import_drive_file(v_cat_communications, v_folder_reg_orders, 'BRS/AN/01/01/2025/BK', '1Xn137NEt-Nk3l2SgTU5d7RLB0xrr5WPDK9swr4vO3Ik', 'https://docs.google.com/document/d/1Xn137NEt-Nk3l2SgTU5d7RLB0xrr5WPDK9swr4vO3Ik/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Anordnungen an die Regierung.', array['drive','anordnung','regierung']);
  perform pg_temp.import_drive_file(v_cat_communications, v_folder_reg_notices, 'BRS/MIT/04/01/2025/REGIERUNG', '1MJZduoU1yKKC4tHd5WBLA92yUqn0XzufB3tUmUif6ms', 'https://docs.google.com/document/d/1MJZduoU1yKKC4tHd5WBLA92yUqn0XzufB3tUmUif6ms/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Mitteilungen an die Regierung.', array['drive','mitteilung','regierung']);
  perform pg_temp.import_drive_file(v_cat_communications, v_folder_reg_notices, 'BRS/MIT/03/02/2025/BK', '1OcA2CSMqmTEAJGPO9CgfF0lJXTDZP1HycRWXDcr1UG0', 'https://docs.google.com/document/d/1OcA2CSMqmTEAJGPO9CgfF0lJXTDZP1HycRWXDcr1UG0/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Mitteilungen an die Regierung.', array['drive','mitteilung','regierung']);
  perform pg_temp.import_drive_file(v_cat_communications, v_folder_reg_notices, 'BRS/MIT/03/01/2025/BK', '1eFykfr5pUTSp7q2dQ-gewfOJvleiFgkNVpyaDxj5PJU', 'https://docs.google.com/document/d/1eFykfr5pUTSp7q2dQ-gewfOJvleiFgkNVpyaDxj5PJU/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Mitteilungen an die Regierung.', array['drive','mitteilung','regierung']);
  perform pg_temp.import_drive_file(v_cat_communications, v_folder_reg_notices, 'Az.: BRS/MIT/02/01/2025/BK', '1H-0Y8_JEvh1mQUeBpRIKf3Vgb2YEOJlUobyJLy9c_i0', 'https://docs.google.com/document/d/1H-0Y8_JEvh1mQUeBpRIKf3Vgb2YEOJlUobyJLy9c_i0/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Mitteilungen an die Regierung.', array['drive','mitteilung','regierung']);
  perform pg_temp.import_drive_file(v_cat_communications, v_folder_reg_notices, 'BRS/MIT/01/01/2025/BK', '1ZrZFY4RPOo2HzBD9FxVIDyZgtek84ETIhAScXPqzigQ', 'https://docs.google.com/document/d/1ZrZFY4RPOo2HzBD9FxVIDyZgtek84ETIhAScXPqzigQ/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Mitteilungen an die Regierung.', array['drive','mitteilung','regierung']);
  perform pg_temp.import_drive_file(v_cat_communications, v_folder_member_orders, 'BRS/MIT/01/01/2025/BK', '11BqL4iWUqnpIs1rSIfZ3-wqki_T7trX7tqMk6n2T6bU', 'https://docs.google.com/document/d/11BqL4iWUqnpIs1rSIfZ3-wqki_T7trX7tqMk6n2T6bU/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Anordnungen an Mitglieder.', array['drive','anordnung','mitglieder']);
  perform pg_temp.import_drive_file(v_cat_communications, v_folder_member_notices, 'BRS/MIT/01/02/2026/BK.docx', '1nSOV0u-msszy1eKCpuiP5JCKBK_nGDfx', 'https://docs.google.com/document/d/1nSOV0u-msszy1eKCpuiP5JCKBK_nGDfx/edit', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Import aus Google Drive: Mitteilungen an Mitglieder.', array['drive','mitteilung','mitglieder','docx']);
  perform pg_temp.import_drive_file(v_cat_communications, v_folder_member_notices, 'BRS/MIT/01/01/2026/BK', '1vLtacXhjYTq2ORxo0utQ0G2LoS8g47QZftyurcttn0Q', 'https://docs.google.com/document/d/1vLtacXhjYTq2ORxo0utQ0G2LoS8g47QZftyurcttn0Q/edit', 'application/vnd.google-apps.document', 'Import aus Google Drive: Mitteilungen an Mitglieder.', array['drive','mitteilung','mitglieder']);

  insert into public.folder_permissions (
    folder_id,
    role_id,
    can_view,
    can_open,
    can_download
  )
  select f.id, r.id, true, true, true
  from public.folders f
  cross join public.roles r
  where r.role_key = 'file_manager'
    and f.category_id in (
      v_cat_communications,
      v_cat_investigations,
      v_cat_law,
      v_cat_admin,
      v_cat_special,
      v_cat_misc
    )
  on conflict (folder_id, role_id) do update
  set
    can_view = true,
    can_open = true,
    can_download = true,
    updated_at = now();
end;
$$;
