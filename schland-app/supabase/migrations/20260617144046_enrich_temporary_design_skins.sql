with design_updates (key, theme_patch) as (
  values
    (
      'default',
      '{"accentColor":"#263f72","accentSoftColor":"#d7dfed","accentStrongColor":"#14284d","backgroundClass":"theme-default","backgroundColor":"#c7cbc8","bannerEnabled":false,"bannerLabel":"","buttonColor":"#111111","decoration":"","headerStyle":"default"}'::jsonb
    ),
    (
      'frauentag',
      '{"accentColor":"#b83280","accentSoftColor":"#fde2f3","accentStrongColor":"#7a174f","backgroundClass":"theme-frauentag","backgroundColor":"#f7d7ea","bannerEnabled":true,"bannerLabel":"Frauentag","buttonColor":"#8a1f62","decoration":"floral","headerStyle":"soft"}'::jsonb
    ),
    (
      'maennertag',
      '{"accentColor":"#1d4ed8","accentSoftColor":"#dbeafe","accentStrongColor":"#1e3a8a","backgroundClass":"theme-maennertag","backgroundColor":"#d6e4ff","bannerEnabled":true,"bannerLabel":"Maennertag","buttonColor":"#1d4ed8","decoration":"badge","headerStyle":"clear"}'::jsonb
    ),
    (
      'wm-2026',
      '{"accentColor":"#117a37","accentSoftColor":"#fff1b8","accentStrongColor":"#0b2f1a","backgroundClass":"theme-wm-2026","backgroundColor":"#cdeed5","bannerEnabled":true,"bannerLabel":"FIFA WM 2026","buttonColor":"#d90429","decoration":"pitch","headerStyle":"stadium"}'::jsonb
    ),
    (
      'weihnachten',
      '{"accentColor":"#b91c1c","accentSoftColor":"#fee2e2","accentStrongColor":"#7f1d1d","backgroundClass":"theme-weihnachten","backgroundColor":"#ead7d7","bannerEnabled":true,"bannerLabel":"Weihnachtsdesign","buttonColor":"#991b1b","decoration":"stars","headerStyle":"festive"}'::jsonb
    ),
    (
      'ostern',
      '{"accentColor":"#7c3aed","accentSoftColor":"#ede9fe","accentStrongColor":"#4c1d95","backgroundClass":"theme-ostern","backgroundColor":"#e9defa","bannerEnabled":true,"bannerLabel":"Ostern","buttonColor":"#6d28d9","decoration":"eggs","headerStyle":"spring"}'::jsonb
    ),
    (
      'neujahr',
      '{"accentColor":"#6d28d9","accentSoftColor":"#f3e8ff","accentStrongColor":"#581c87","backgroundClass":"theme-neujahr","backgroundColor":"#ded9f3","bannerEnabled":true,"bannerLabel":"Neujahr","buttonColor":"#4c1d95","decoration":"spark","headerStyle":"celebration"}'::jsonb
    ),
    (
      'halloween',
      '{"accentColor":"#7c2d12","accentSoftColor":"#ffedd5","accentStrongColor":"#431407","backgroundClass":"theme-halloween","backgroundColor":"#ead4c0","bannerEnabled":true,"bannerLabel":"Halloween","buttonColor":"#9a3412","decoration":"moon","headerStyle":"seasonal"}'::jsonb
    ),
    (
      'valentinstag',
      '{"accentColor":"#be123c","accentSoftColor":"#ffe4e6","accentStrongColor":"#881337","backgroundClass":"theme-valentinstag","backgroundColor":"#f3d5dc","bannerEnabled":true,"bannerLabel":"Valentinstag","buttonColor":"#be123c","decoration":"heart","headerStyle":"soft"}'::jsonb
    ),
    (
      'black-friday',
      '{"accentColor":"#111111","accentSoftColor":"#e5e5e5","accentStrongColor":"#000000","backgroundClass":"theme-black-friday","backgroundColor":"#d4d4d4","bannerEnabled":true,"bannerLabel":"Black Friday","buttonColor":"#111111","decoration":"contrast","headerStyle":"contrast"}'::jsonb
    )
)
update public.temporary_design_templates as templates
set
  theme = coalesce(templates.theme, '{}'::jsonb) || design_updates.theme_patch,
  updated_at = now()
from design_updates
where templates.key = design_updates.key;
