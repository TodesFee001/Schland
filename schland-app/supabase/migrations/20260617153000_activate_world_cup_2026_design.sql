insert into public.temporary_design_settings (id, enabled, automatic_enabled)
values (true, true, true)
on conflict (id) do update
set
  automatic_enabled = true,
  enabled = true,
  updated_at = now();

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
values (
  'wm-2026',
  'WM 2026',
  'Fussball-Weltmeisterschaft 2026',
  true,
  false,
  false,
  '2026-06-11',
  '2026-07-19',
  null,
  0,
  0,
  90,
  '{
    "accentColor": "#117a37",
    "accentSoftColor": "#fff1b8",
    "accentStrongColor": "#0b2f1a",
    "backgroundClass": "theme-wm-2026",
    "backgroundColor": "#cdeed5",
    "bannerEnabled": true,
    "bannerLabel": "FIFA WM 2026",
    "buttonColor": "#d90429",
    "decoration": "pitch",
    "headerStyle": "stadium"
  }'::jsonb
)
on conflict (key) do update
set
  dynamic_date = excluded.dynamic_date,
  enabled = excluded.enabled,
  end_date = excluded.end_date,
  end_offset_days = excluded.end_offset_days,
  event_name = excluded.event_name,
  manual_only = excluded.manual_only,
  name = excluded.name,
  priority = excluded.priority,
  recurring = excluded.recurring,
  start_date = excluded.start_date,
  start_offset_days = excluded.start_offset_days,
  theme = excluded.theme,
  updated_at = now();
