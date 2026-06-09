create table if not exists public.systemprotokoll (
  id uuid primary key default gen_random_uuid(),
  benutzer_id uuid references public.profiles(id) on delete set null,
  aktion text not null,
  bereich text not null,
  details text,
  created_at timestamptz not null default now()
);

alter table public.systemprotokoll enable row level security;

drop policy if exists "system protocol visible to auditors" on public.systemprotokoll;
create policy "system protocol visible to auditors"
on public.systemprotokoll for select
to authenticated
using (
  public.has_permission('audit.security.view')
  or public.has_permission('audit.activity.view')
);

grant select on table public.systemprotokoll to authenticated;

insert into public.permissions (permission_key, description)
values
  ('*', 'Wildcard-Vollzugriff fuer Root Owner'),
  ('users.view', 'Benutzer anzeigen'),
  ('users.create', 'Benutzer erstellen'),
  ('users.update', 'Benutzer bearbeiten'),
  ('users.deactivate', 'Benutzer deaktivieren'),
  ('users.assign_roles', 'Benutzerrollen zuweisen'),
  ('roles.view', 'Rollen anzeigen'),
  ('permissions.view', 'Berechtigungen anzeigen'),
  ('member_records.sensitive.view', 'Sensible Mitgliederakten anzeigen'),
  ('member_records.sensitive.edit', 'Sensible Mitgliederakten bearbeiten'),
  ('member_records.sensitive.delete', 'Sensible Mitgliederakten loeschen'),
  ('member_records.sensitive.export', 'Sensible Mitgliederakten exportieren'),
  ('member_records.sensitive.audit', 'Sensible Mitgliederakten-Audit anzeigen'),
  ('investigations.view', 'Ermittlungen anzeigen'),
  ('investigations.edit', 'Ermittlungen bearbeiten'),
  ('investigations.delete', 'Ermittlungen loeschen'),
  ('investigations.export', 'Ermittlungen exportieren'),
  ('investigations.audit', 'Ermittlungs-Audit anzeigen'),
  ('legislation.view', 'Gesetzgebung anzeigen'),
  ('legislation.edit', 'Gesetzgebung bearbeiten'),
  ('legislation.publish', 'Gesetzgebung veroeffentlichen'),
  ('communications.view', 'Kommunikation anzeigen'),
  ('communications.edit', 'Kommunikation bearbeiten'),
  ('communications.manage', 'Kommunikation verwalten'),
  ('folders.permissions.manage', 'Ordnerrechte verwalten'),
  ('audit.activity.view', 'Aktivitaets-Audit anzeigen'),
  ('audit.security.view', 'Sicherheits-Audit anzeigen'),
  ('audit.export', 'Audit exportieren')
on conflict (permission_key) do update
set description = excluded.description;

update public.roles
set
  name = 'Administrator (Legacy)',
  description = 'Legacy-Rolle. Durch root_owner/platform_admin ersetzt.',
  active = false,
  updated_at = now()
where role_key = 'administrator';

insert into public.roles (role_key, name, description, active)
values
  ('root_owner', 'Root Owner', 'Geschuetzter Notfallzugang mit Vollzugriff.', true),
  ('platform_admin', 'Administrator', 'Technische Verwaltung von Nutzern, Rollen, Dateien und Systemdaten.', true),
  ('federal_chancellor', 'Bundeskanzler', 'Leitung mit Zugriff auf sensible Akten, Ermittlungen, Gesetzgebung und Kommunikation.', true),
  ('federal_vice_chancellor', 'Vizekanzler', 'Stellvertretende Leitung mit Akten-, Ermittlungs- und Kommunikationszugriff.', true),
  ('interior_ministry', 'Innenministerium', 'Innenverwaltung mit Akten-, Ermittlungs-, Gesetzgebungs-, Kommunikations- und Moderationszugriff.', true),
  ('federal_president', 'Bundespraesident', 'Praesidialrolle fuer Ermittlungen, Gesetzgebung und Kommunikation.', true),
  ('prosecutor_general', 'Generalbundesanwalt', 'Ermittlungs- und Kommunikationsrolle.', true),
  ('read_only_auditor', 'Nur-Lesen / Audit', 'Lesender Audit- und Regelzugriff.', true),
  ('file_manager', 'Dateiverwaltung', 'Verwaltung von Dateien, Ordnern und Ordnerrechten.', true),
  ('moderation_manager', 'Moderation Verwaltung', 'Moderationsregister und Discord-Moderationsaktionen.', true),
  ('sync_bot_manager', 'Sync/Bot Verwaltung', 'Synchronisation, Bot-Steuerung und Discord-Einladungen.', true)
on conflict (role_key) do update
set
  name = excluded.name,
  description = excluded.description,
  active = excluded.active,
  updated_at = now();

update public.roles
set
  name = 'Standardnutzer',
  description = 'Grundzugriff auf Gesetzgebung und Kommunikation.',
  active = true,
  updated_at = now()
where role_key = 'standard_user';

with role_permission_matrix(role_key, permission_key) as (
  values
    ('root_owner', '*'),

    ('platform_admin', 'app.enter'),
    ('platform_admin', 'users.view'),
    ('platform_admin', 'users.create'),
    ('platform_admin', 'users.update'),
    ('platform_admin', 'users.deactivate'),
    ('platform_admin', 'users.assign_roles'),
    ('platform_admin', 'users.manage'),
    ('platform_admin', 'roles.view'),
    ('platform_admin', 'roles.manage'),
    ('platform_admin', 'permissions.view'),
    ('platform_admin', 'audit.activity.view'),
    ('platform_admin', 'audit.security.view'),
    ('platform_admin', 'activity.view'),
    ('platform_admin', 'files.view'),
    ('platform_admin', 'files.open'),
    ('platform_admin', 'files.upload'),
    ('platform_admin', 'files.download'),
    ('platform_admin', 'files.edit'),
    ('platform_admin', 'files.delete'),
    ('platform_admin', 'files.manage'),
    ('platform_admin', 'folders.view'),
    ('platform_admin', 'folders.manage'),
    ('platform_admin', 'folders.permissions.manage'),
    ('platform_admin', 'categories.manage'),

    ('federal_chancellor', 'app.enter'),
    ('federal_chancellor', 'member_records.sensitive.view'),
    ('federal_chancellor', 'member_records.sensitive.edit'),
    ('federal_chancellor', 'member_records.sensitive.export'),
    ('federal_chancellor', 'member_records.sensitive.audit'),
    ('federal_chancellor', 'members.search'),
    ('federal_chancellor', 'members.open'),
    ('federal_chancellor', 'members.edit'),
    ('federal_chancellor', 'members.export'),
    ('federal_chancellor', 'members.audit'),
    ('federal_chancellor', 'investigations.view'),
    ('federal_chancellor', 'investigations.edit'),
    ('federal_chancellor', 'legislation.view'),
    ('federal_chancellor', 'legislation.edit'),
    ('federal_chancellor', 'communications.view'),
    ('federal_chancellor', 'communications.edit'),

    ('federal_vice_chancellor', 'app.enter'),
    ('federal_vice_chancellor', 'member_records.sensitive.view'),
    ('federal_vice_chancellor', 'member_records.sensitive.edit'),
    ('federal_vice_chancellor', 'member_records.sensitive.audit'),
    ('federal_vice_chancellor', 'members.search'),
    ('federal_vice_chancellor', 'members.open'),
    ('federal_vice_chancellor', 'members.edit'),
    ('federal_vice_chancellor', 'members.audit'),
    ('federal_vice_chancellor', 'investigations.view'),
    ('federal_vice_chancellor', 'investigations.edit'),
    ('federal_vice_chancellor', 'communications.view'),
    ('federal_vice_chancellor', 'communications.edit'),

    ('interior_ministry', 'app.enter'),
    ('interior_ministry', 'member_records.sensitive.view'),
    ('interior_ministry', 'member_records.sensitive.edit'),
    ('interior_ministry', 'member_records.sensitive.audit'),
    ('interior_ministry', 'members.search'),
    ('interior_ministry', 'members.open'),
    ('interior_ministry', 'members.edit'),
    ('interior_ministry', 'members.audit'),
    ('interior_ministry', 'investigations.view'),
    ('interior_ministry', 'investigations.edit'),
    ('interior_ministry', 'legislation.view'),
    ('interior_ministry', 'legislation.edit'),
    ('interior_ministry', 'communications.view'),
    ('interior_ministry', 'communications.edit'),
    ('interior_ministry', 'moderation.view'),
    ('interior_ministry', 'moderation.manage'),

    ('federal_president', 'app.enter'),
    ('federal_president', 'investigations.view'),
    ('federal_president', 'investigations.edit'),
    ('federal_president', 'legislation.view'),
    ('federal_president', 'legislation.edit'),
    ('federal_president', 'communications.view'),
    ('federal_president', 'communications.edit'),

    ('prosecutor_general', 'app.enter'),
    ('prosecutor_general', 'investigations.view'),
    ('prosecutor_general', 'investigations.edit'),
    ('prosecutor_general', 'communications.view'),
    ('prosecutor_general', 'communications.edit'),

    ('standard_user', 'app.enter'),
    ('standard_user', 'legislation.view'),
    ('standard_user', 'communications.view'),
    ('standard_user', 'communications.edit'),

    ('read_only_auditor', 'app.enter'),
    ('read_only_auditor', 'audit.activity.view'),
    ('read_only_auditor', 'activity.view'),
    ('read_only_auditor', 'legislation.view'),
    ('read_only_auditor', 'communications.view'),

    ('file_manager', 'app.enter'),
    ('file_manager', 'files.view'),
    ('file_manager', 'files.open'),
    ('file_manager', 'files.upload'),
    ('file_manager', 'files.download'),
    ('file_manager', 'files.edit'),
    ('file_manager', 'files.delete'),
    ('file_manager', 'files.manage'),
    ('file_manager', 'folders.view'),
    ('file_manager', 'folders.manage'),
    ('file_manager', 'folders.permissions.manage'),

    ('moderation_manager', 'app.enter'),
    ('moderation_manager', 'moderation.view'),
    ('moderation_manager', 'moderation.manage'),
    ('moderation_manager', 'communications.view'),
    ('moderation_manager', 'communications.edit'),

    ('sync_bot_manager', 'app.enter'),
    ('sync_bot_manager', 'sync.manage'),
    ('sync_bot_manager', 'discord.invites.create'),

    ('member_case_reader', 'member_records.sensitive.view'),
    ('member_case_reader', 'member_records.sensitive.audit'),
    ('member_case_editor', 'member_records.sensitive.view'),
    ('member_case_editor', 'member_records.sensitive.edit'),
    ('member_case_editor', 'member_records.sensitive.export'),
    ('member_case_editor', 'member_records.sensitive.audit'),
    ('member_case_editor', 'moderation.view')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from role_permission_matrix rpm
join public.roles r on r.role_key = rpm.role_key
join public.permissions p on p.permission_key = rpm.permission_key
on conflict do nothing;

with legacy_admin_users as (
  select distinct ur.user_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where r.role_key = 'administrator'
),
target_roles as (
  select id
  from public.roles
  where role_key in ('root_owner', 'platform_admin')
)
insert into public.user_roles (user_id, role_id)
select lau.user_id, tr.id
from legacy_admin_users lau
cross join target_roles tr
on conflict do nothing;

create or replace function public.has_role(required_key text)
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
    join public.roles r on r.id = ur.role_id
    where p.id = auth.uid()
      and p.status = 'active'
      and r.active = true
      and r.role_key = required_key
  );
$$;

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
      and (perm.permission_key = required_key or perm.permission_key = '*')
  );
$$;

create or replace function public.claim_first_administrator()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_roots integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext('schland_first_root_claim'));

  select count(*)
  into v_existing_roots
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.profiles p on p.id = ur.user_id
  where r.role_key = 'root_owner'
    and r.active = true
    and p.status = 'active';

  if v_existing_roots > 0 then
    return false;
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
  select v_user_id, r.id
  from public.roles r
  where r.role_key in ('root_owner', 'platform_admin')
    and r.active = true
  on conflict do nothing;

  return true;
end;
$$;

create or replace function public.assign_administrator_by_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from public.profiles
  where lower(email) = lower(p_email)
  limit 1;

  if v_user_id is null then
    raise exception 'profile not found for email %', p_email;
  end if;

  insert into public.user_roles (user_id, role_id)
  select v_user_id, r.id
  from public.roles r
  where r.role_key = 'platform_admin'
    and r.active = true
  on conflict do nothing;
end;
$$;

create or replace function public.set_user_role_assignment(
  p_user_id uuid,
  p_role_id uuid,
  p_assign boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_assignment_count integer;
  v_changed integer;
  v_role_key text;
begin
  if auth.uid() is null then
    raise exception 'role assignment denied';
  end if;

  if not public.has_permission('users.assign_roles') or not public.has_mfa_level2() then
    raise exception 'role assignment denied';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_user_id
  ) then
    raise exception 'profile not found';
  end if;

  select role_key into v_role_key
  from public.roles
  where id = p_role_id
    and active = true;

  if v_role_key is null then
    raise exception 'role not found';
  end if;

  if v_role_key = 'root_owner' and not public.has_role('root_owner') then
    raise exception 'root owner assignment denied';
  end if;

  if p_assign then
    insert into public.user_roles (user_id, role_id)
    values (p_user_id, p_role_id)
    on conflict do nothing;

    get diagnostics v_changed = row_count;
  else
    if v_role_key in ('root_owner', 'platform_admin') then
      select count(distinct ur.user_id) into v_active_assignment_count
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      join public.profiles p on p.id = ur.user_id
      where r.role_key = v_role_key
        and r.active = true
        and p.status = 'active';

      if v_active_assignment_count <= 1 and exists (
        select 1
        from public.user_roles
        where user_id = p_user_id
          and role_id = p_role_id
      ) then
        raise exception 'cannot remove last root/admin assignment';
      end if;
    end if;

    delete from public.user_roles
    where user_id = p_user_id
      and role_id = p_role_id;

    get diagnostics v_changed = row_count;
  end if;

  if v_changed > 0 then
    insert into public.systemprotokoll (benutzer_id, aktion, bereich, details)
    values (
      auth.uid(),
      case when p_assign then 'role_assigned' else 'role_removed' end,
      'users',
      concat('target_user=', p_user_id::text, '; role=', p_role_id::text)
    );
  end if;
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
    if v_role_key = 'root_owner' then
      raise exception 'root owner role cannot be created through UI';
    end if;

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

    if v_existing_key = 'root_owner' then
      raise exception 'root owner role cannot be modified';
    end if;

    if v_existing_key = 'platform_admin' and coalesce(p_active, true) = false then
      raise exception 'platform admin role cannot be disabled';
    end if;

    update public.roles
    set
      role_key = case
        when v_existing_key in ('root_owner', 'platform_admin') then v_existing_key
        else v_role_key
      end,
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

  if v_role_key = 'root_owner' then
    raise exception 'root owner permissions cannot be modified';
  end if;

  if p_assign then
    insert into public.role_permissions (role_id, permission_id)
    values (p_role_id, p_permission_id)
    on conflict do nothing;
  else
    if v_role_key = 'platform_admin'
      and v_permission_key in (
        'app.enter',
        'users.view',
        'users.create',
        'users.update',
        'users.deactivate',
        'users.assign_roles',
        'roles.view',
        'roles.manage',
        'permissions.view'
      )
    then
      raise exception 'platform admin core permission cannot be removed';
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

revoke all on function public.has_role(text) from public;
revoke all on function public.has_role(text) from anon;
grant execute on function public.has_role(text) to authenticated;

revoke all on function public.has_permission(text) from public;
revoke all on function public.has_permission(text) from anon;
grant execute on function public.has_permission(text) to authenticated;

revoke all on function public.claim_first_administrator() from public;
revoke all on function public.claim_first_administrator() from anon;
grant execute on function public.claim_first_administrator() to authenticated;

revoke all on function public.assign_administrator_by_email(text) from public;
revoke all on function public.assign_administrator_by_email(text) from anon;
revoke all on function public.assign_administrator_by_email(text) from authenticated;

revoke all on function public.set_user_role_assignment(uuid, uuid, boolean) from public;
revoke all on function public.set_user_role_assignment(uuid, uuid, boolean) from anon;
grant execute on function public.set_user_role_assignment(uuid, uuid, boolean) to authenticated;

revoke all on function public.save_role(uuid, text, text, text, boolean) from public;
revoke all on function public.save_role(uuid, text, text, text, boolean) from anon;
grant execute on function public.save_role(uuid, text, text, text, boolean) to authenticated;

revoke all on function public.set_role_permission_assignment(uuid, uuid, boolean) from public;
revoke all on function public.set_role_permission_assignment(uuid, uuid, boolean) from anon;
grant execute on function public.set_role_permission_assignment(uuid, uuid, boolean) to authenticated;
