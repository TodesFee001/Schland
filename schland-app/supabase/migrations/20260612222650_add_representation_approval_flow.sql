alter table public.member_absence_representations
  add column if not exists approval_status text not null default 'pending',
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approval_responded_at timestamptz,
  add column if not exists approval_message_id text
    check (approval_message_id is null or approval_message_id ~ '^[0-9]{15,25}$'),
  add column if not exists approval_channel_id text
    check (approval_channel_id is null or approval_channel_id ~ '^[0-9]{15,25}$'),
  add column if not exists approval_error text,
  add column if not exists approval_attempts integer not null default 0
    check (approval_attempts >= 0),
  add column if not exists declined_representative_discord_ids text[] not null default '{}';

alter table public.member_absence_representations
  drop constraint if exists member_absence_representations_approval_status_check,
  add constraint member_absence_representations_approval_status_check
    check (approval_status in ('pending', 'accepted', 'declined', 'failed'));

update public.member_absence_representations
set approval_status = case
    when status in ('active', 'assigning', 'ending', 'ended') then 'accepted'
    when status = 'failed' then 'failed'
    else approval_status
  end,
  approval_responded_at = case
    when status in ('active', 'assigning', 'ending', 'ended')
      and approval_responded_at is null
    then coalesce(assigned_at, created_at, now())
    else approval_responded_at
  end
where approval_status is null
   or status in ('active', 'assigning', 'ending', 'ended', 'failed');

create index if not exists idx_member_absence_representations_approval_queue
on public.member_absence_representations(status, approval_status, approval_requested_at, created_at);

create index if not exists idx_member_absence_representations_declined_gin
on public.member_absence_representations using gin(declined_representative_discord_ids);
