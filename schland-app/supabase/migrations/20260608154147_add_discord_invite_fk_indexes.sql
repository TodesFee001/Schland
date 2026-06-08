create index if not exists discord_invite_requests_requested_by_idx
on public.discord_invite_requests (requested_by);

create index if not exists discord_invite_requests_requested_permission_idx
on public.discord_invite_requests (requested_permission_id);

create index if not exists members_discord_analytics_disabled_by_idx
on public.members (discord_analytics_disabled_by);
