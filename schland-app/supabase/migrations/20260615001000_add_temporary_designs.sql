insert into public.permissions (permission_key, description)
values
  ('design.view', 'Temporaere Designs anzeigen'),
  ('design.manage', 'Temporaere Designs verwalten')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_key in ('design.view', 'design.manage')
where r.role_key = 'platform_admin'
on conflict do nothing;

create table if not exists public.temporary_design_settings (
  id boolean primary key default true,
  enabled boolean not null default true,
  automatic_enabled boolean not null default true,
  manual_enabled boolean not null default false,
  manual_template_key text,
  manual_start_date date,
  manual_end_date date,
  manual_priority integer not null default 100,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint temporary_design_settings_singleton_check check (id = true),
  constraint temporary_design_settings_manual_range_check
    check (manual_start_date is null or manual_end_date is null or manual_start_date <= manual_end_date)
);

create table if not exists public.temporary_design_templates (
  key text primary key,
  name text not null,
  event_name text not null default '',
  enabled boolean not null default true,
  manual_only boolean not null default false,
  recurring boolean not null default false,
  start_date text,
  end_date text,
  dynamic_date text,
  start_offset_days integer not null default 0,
  end_offset_days integer not null default 0,
  priority integer not null default 0,
  theme jsonb not null default '{}',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint temporary_design_templates_key_check check (key ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  constraint temporary_design_templates_priority_check check (priority between 0 and 999)
);

drop trigger if exists temporary_design_settings_updated_at on public.temporary_design_settings;
create trigger temporary_design_settings_updated_at
before update on public.temporary_design_settings
for each row execute function public.set_updated_at();

drop trigger if exists temporary_design_templates_updated_at on public.temporary_design_templates;
create trigger temporary_design_templates_updated_at
before update on public.temporary_design_templates
for each row execute function public.set_updated_at();

alter table public.temporary_design_settings enable row level security;
alter table public.temporary_design_templates enable row level security;

drop policy if exists "temporary design settings visible" on public.temporary_design_settings;
create policy "temporary design settings visible"
on public.temporary_design_settings for select
to authenticated
using (
  public.has_permission('app.enter')
  and (
    public.has_permission('design.view')
    or public.has_permission('design.manage')
  )
);

drop policy if exists "temporary design settings managed" on public.temporary_design_settings;
create policy "temporary design settings managed"
on public.temporary_design_settings for all
to authenticated
using (public.has_permission('design.manage') and public.has_mfa_level2())
with check (public.has_permission('design.manage') and public.has_mfa_level2());

drop policy if exists "temporary design templates visible" on public.temporary_design_templates;
create policy "temporary design templates visible"
on public.temporary_design_templates for select
to authenticated
using (
  public.has_permission('app.enter')
  and (
    public.has_permission('design.view')
    or public.has_permission('design.manage')
  )
);

drop policy if exists "temporary design templates managed" on public.temporary_design_templates;
create policy "temporary design templates managed"
on public.temporary_design_templates for all
to authenticated
using (public.has_permission('design.manage') and public.has_mfa_level2())
with check (public.has_permission('design.manage') and public.has_mfa_level2());

grant select on table public.temporary_design_settings to authenticated;
grant select on table public.temporary_design_templates to authenticated;
grant insert, update, delete on table public.temporary_design_settings to authenticated;
grant insert, update, delete on table public.temporary_design_templates to authenticated;

insert into public.temporary_design_settings (id)
values (true)
on conflict (id) do nothing;

insert into public.temporary_design_templates (
  key,
  name,
  event_name,
  enabled,
  manual_only,
  recurring,
  start_date,
  end_date,
  dynamic_date,
  start_offset_days,
  end_offset_days,
  priority,
  theme
)
values
  ('default', 'Standard', 'Standard', true, false, false, null, null, null, 0, 0, 0, '{"accentColor":"#263f72","accentSoftColor":"#d7dfed","accentStrongColor":"#14284d","backgroundClass":"theme-default","backgroundColor":"#c7cbc8","bannerEnabled":false,"bannerLabel":"","buttonColor":"#111111","decoration":"","headerStyle":"default"}'::jsonb),
  ('frauentag', 'Frauentag', 'Frauentag', true, false, true, '03-08', '03-08', null, 0, 0, 20, '{"accentColor":"#b83280","accentSoftColor":"#fde2f3","accentStrongColor":"#7a174f","backgroundClass":"theme-frauentag","backgroundColor":"#f7d7ea","bannerEnabled":true,"bannerLabel":"Frauentag","buttonColor":"#8a1f62","decoration":"floral","headerStyle":"soft"}'::jsonb),
  ('maennertag', 'Maennertag', 'Maennertag / Vatertag', true, false, false, null, null, 'christi_himmelfahrt', 0, 0, 20, '{"accentColor":"#1d4ed8","accentSoftColor":"#dbeafe","accentStrongColor":"#1e3a8a","backgroundClass":"theme-maennertag","backgroundColor":"#d6e4ff","bannerEnabled":true,"bannerLabel":"Maennertag","buttonColor":"#1d4ed8","decoration":"badge","headerStyle":"clear"}'::jsonb),
  ('wm-2026', 'WM 2026', 'Fussball-Weltmeisterschaft 2026', false, true, false, null, null, null, 0, 0, 30, '{"accentColor":"#15803d","accentSoftColor":"#dcfce7","accentStrongColor":"#14532d","backgroundClass":"theme-wm-2026","backgroundColor":"#d8f3dc","bannerEnabled":true,"bannerLabel":"WM 2026","buttonColor":"#166534","decoration":"pitch","headerStyle":"sport"}'::jsonb),
  ('weihnachten', 'Weihnachten', 'Weihnachten', true, false, true, '12-01', '12-26', null, 0, 0, 20, '{"accentColor":"#b91c1c","accentSoftColor":"#fee2e2","accentStrongColor":"#7f1d1d","backgroundClass":"theme-weihnachten","backgroundColor":"#ead7d7","bannerEnabled":true,"bannerLabel":"Weihnachtsdesign","buttonColor":"#991b1b","decoration":"stars","headerStyle":"festive"}'::jsonb),
  ('ostern', 'Ostern', 'Ostern', true, false, false, null, null, 'easter_sunday', -2, 1, 20, '{"accentColor":"#7c3aed","accentSoftColor":"#ede9fe","accentStrongColor":"#4c1d95","backgroundClass":"theme-ostern","backgroundColor":"#e9defa","bannerEnabled":true,"bannerLabel":"Ostern","buttonColor":"#6d28d9","decoration":"eggs","headerStyle":"spring"}'::jsonb),
  ('neujahr', 'Neujahr', 'Neujahr / Silvester', true, false, true, '12-31', '01-01', null, 0, 0, 25, '{"accentColor":"#6d28d9","accentSoftColor":"#f3e8ff","accentStrongColor":"#581c87","backgroundClass":"theme-neujahr","backgroundColor":"#ded9f3","bannerEnabled":true,"bannerLabel":"Neujahr","buttonColor":"#4c1d95","decoration":"spark","headerStyle":"celebration"}'::jsonb),
  ('halloween', 'Halloween', 'Halloween', true, false, true, '10-31', '10-31', null, 0, 0, 20, '{"accentColor":"#7c2d12","accentSoftColor":"#ffedd5","accentStrongColor":"#431407","backgroundClass":"theme-halloween","backgroundColor":"#ead4c0","bannerEnabled":true,"bannerLabel":"Halloween","buttonColor":"#9a3412","decoration":"moon","headerStyle":"seasonal"}'::jsonb),
  ('valentinstag', 'Valentinstag', 'Valentinstag', true, false, true, '02-14', '02-14', null, 0, 0, 20, '{"accentColor":"#be123c","accentSoftColor":"#ffe4e6","accentStrongColor":"#881337","backgroundClass":"theme-valentinstag","backgroundColor":"#f3d5dc","bannerEnabled":true,"bannerLabel":"Valentinstag","buttonColor":"#be123c","decoration":"heart","headerStyle":"soft"}'::jsonb),
  ('black-friday', 'Black Friday', 'Black Friday', true, false, false, null, null, 'black_friday', 0, 0, 20, '{"accentColor":"#111111","accentSoftColor":"#e5e5e5","accentStrongColor":"#000000","backgroundClass":"theme-black-friday","backgroundColor":"#d4d4d4","bannerEnabled":true,"bannerLabel":"Black Friday","buttonColor":"#111111","decoration":"contrast","headerStyle":"contrast"}'::jsonb)
on conflict (key) do nothing;
