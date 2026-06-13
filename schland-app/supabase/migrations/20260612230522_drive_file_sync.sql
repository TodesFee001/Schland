alter table public.folders
  add column if not exists google_drive_folder_id text,
  add column if not exists google_drive_parent_id text,
  add column if not exists path text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists deleted_at timestamptz,
  add column if not exists sync_status text not null default 'needs_review',
  add column if not exists last_synced_at timestamptz,
  add column if not exists drive_modified_at timestamptz,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.files
  add column if not exists google_drive_file_id text,
  add column if not exists google_drive_parent_id text,
  add column if not exists google_drive_web_view_link text,
  add column if not exists google_drive_preview_link text,
  add column if not exists extension text,
  add column if not exists checksum text,
  add column if not exists content_hash text,
  add column if not exists sync_status text not null default 'needs_review',
  add column if not exists last_synced_at timestamptz,
  add column if not exists drive_modified_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists is_google_doc boolean not null default false,
  add column if not exists is_template_copy boolean not null default false,
  add column if not exists template_source_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.folders
  drop constraint if exists folders_sync_status_check,
  add constraint folders_sync_status_check
  check (sync_status in (
    'synced',
    'pending_upload',
    'pending_download',
    'pending_move',
    'conflict',
    'failed',
    'orphaned',
    'needs_review'
  ));

alter table public.files
  drop constraint if exists files_sync_status_check,
  add constraint files_sync_status_check
  check (sync_status in (
    'synced',
    'pending_upload',
    'pending_download',
    'pending_move',
    'conflict',
    'failed',
    'orphaned',
    'needs_review'
  ));

create unique index if not exists idx_folders_google_drive_folder_id
on public.folders (google_drive_folder_id)
where google_drive_folder_id is not null;

create unique index if not exists idx_files_google_drive_file_id
on public.files (google_drive_file_id)
where google_drive_file_id is not null;

create index if not exists idx_folders_sync_status
on public.folders (sync_status, last_synced_at);

create index if not exists idx_files_sync_status
on public.files (sync_status, last_synced_at);

create index if not exists idx_files_deleted_at
on public.files (deleted_at);

create index if not exists idx_folders_deleted_at
on public.folders (deleted_at);

update public.files
set
  google_drive_file_id = source_id,
  google_drive_web_view_link = external_url,
  is_google_doc = coalesce(source_mime_type, file_type) = 'application/vnd.google-apps.document',
  sync_status = case
    when source = 'google_drive' and source_id is not null then 'synced'
    else sync_status
  end,
  last_synced_at = case
    when source = 'google_drive' and source_id is not null then coalesce(last_synced_at, updated_at)
    else last_synced_at
  end
where source = 'google_drive'
  and source_id is not null
  and google_drive_file_id is null;

update public.files
set
  extension = lower(nullif(regexp_replace(original_filename, '^.*\.', ''), original_filename)),
  is_google_doc = coalesce(source_mime_type, file_type) = 'application/vnd.google-apps.document'
where extension is null;

update public.folders
set path = name
where path is null;

alter table public.sync_runs
  add column if not exists trigger_type text,
  add column if not exists triggered_by uuid references public.profiles(id) on delete set null,
  add column if not exists summary jsonb not null default '{}'::jsonb,
  add column if not exists files_scanned integer not null default 0,
  add column if not exists files_created integer not null default 0,
  add column if not exists files_updated integer not null default 0,
  add column if not exists files_moved integer not null default 0,
  add column if not exists folders_created integer not null default 0,
  add column if not exists folders_updated integer not null default 0,
  add column if not exists conflicts_found integer not null default 0,
  add column if not exists errors_found integer not null default 0;

alter table public.sync_runs
  drop constraint if exists sync_runs_trigger_type_check,
  add constraint sync_runs_trigger_type_check
  check (
    trigger_type is null
    or trigger_type in ('manual', 'scheduled_06', 'scheduled_20', 'cron', 'system')
  );

create table if not exists public.drive_sync_logs (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid references public.sync_runs(id) on delete cascade,
  type text not null default 'sync',
  direction text not null default 'bidirectional',
  status text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  google_drive_id text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint drive_sync_logs_direction_check check (
    direction in (
      'website_to_drive',
      'drive_to_website',
      'bidirectional',
      'cleanup',
      'classification'
    )
  ),
  constraint drive_sync_logs_status_check check (
    status in ('started', 'success', 'skipped', 'warning', 'failed', 'conflict')
  )
);

create index if not exists idx_drive_sync_logs_run_created
on public.drive_sync_logs (sync_run_id, created_at desc);

create index if not exists idx_drive_sync_logs_status
on public.drive_sync_logs (status, created_at desc);

create table if not exists public.drive_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  entity_type text not null,
  local_entity_id uuid,
  google_drive_id text,
  conflict_type text not null,
  local_value jsonb not null default '{}'::jsonb,
  drive_value jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  constraint drive_sync_conflicts_entity_type_check check (
    entity_type in ('file', 'folder', 'sync', 'template')
  ),
  constraint drive_sync_conflicts_status_check check (
    status in ('open', 'resolved', 'ignored')
  )
);

create index if not exists idx_drive_sync_conflicts_status_created
on public.drive_sync_conflicts (status, created_at desc);

create unique index if not exists idx_drive_sync_conflicts_open_dedupe
on public.drive_sync_conflicts (
  entity_type,
  conflict_type,
  coalesce(local_entity_id::text, ''),
  coalesce(google_drive_id, '')
)
where status = 'open';

alter table public.drive_sync_logs enable row level security;
alter table public.drive_sync_conflicts enable row level security;

drop policy if exists "drive sync logs visible to sync managers" on public.drive_sync_logs;
create policy "drive sync logs visible to sync managers"
on public.drive_sync_logs for select
to authenticated
using (
  public.has_permission('sync.manage')
  or public.has_permission('files.manage')
);

drop policy if exists "drive sync logs writable to sync managers" on public.drive_sync_logs;
create policy "drive sync logs writable to sync managers"
on public.drive_sync_logs for insert
to authenticated
with check (
  public.has_permission('sync.manage')
  or public.has_permission('files.manage')
);

drop policy if exists "drive sync conflicts visible to sync managers" on public.drive_sync_conflicts;
create policy "drive sync conflicts visible to sync managers"
on public.drive_sync_conflicts for select
to authenticated
using (
  public.has_permission('sync.manage')
  or public.has_permission('files.manage')
);

drop policy if exists "drive sync conflicts writable to sync managers" on public.drive_sync_conflicts;
create policy "drive sync conflicts writable to sync managers"
on public.drive_sync_conflicts for insert
to authenticated
with check (
  public.has_permission('sync.manage')
  or public.has_permission('files.manage')
);

drop policy if exists "drive sync conflicts update by sync managers" on public.drive_sync_conflicts;
create policy "drive sync conflicts update by sync managers"
on public.drive_sync_conflicts for update
to authenticated
using (
  public.has_permission('sync.manage')
  or public.has_permission('files.manage')
)
with check (
  public.has_permission('sync.manage')
  or public.has_permission('files.manage')
);

create or replace function public.soft_delete_file_record(
  p_file_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then
    raise exception 'file delete denied';
  end if;

  if not public.has_permission('files.delete') or not public.has_mfa_level2() then
    raise exception 'file delete denied';
  end if;

  if v_reason is null or length(v_reason) < 8 then
    raise exception 'delete reason is required';
  end if;

  select *
  into v_file
  from public.files
  where id = p_file_id
    and deleted_at is null;

  if not found then
    raise exception 'file not found';
  end if;

  if v_file.folder_id is not null and not public.has_folder_permission(v_file.folder_id, 'delete') then
    raise exception 'file delete denied';
  end if;

  update public.files
  set
    deleted_at = now(),
    sync_status = 'needs_review',
    updated_by = auth.uid(),
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'softDeleteReason', v_reason,
        'softDeletedBy', auth.uid(),
        'softDeletedAt', now()
      ),
    updated_at = now()
  where id = p_file_id;

  insert into public.systemprotokoll (benutzer_id, aktion, bereich, details)
  values (
    auth.uid(),
    'file_soft_deleted',
    'files',
    concat('file=', p_file_id::text, '; reason=', v_reason)
  );
end;
$$;

revoke all on function public.soft_delete_file_record(uuid, text) from public;
revoke all on function public.soft_delete_file_record(uuid, text) from anon;
grant execute on function public.soft_delete_file_record(uuid, text) to authenticated;
