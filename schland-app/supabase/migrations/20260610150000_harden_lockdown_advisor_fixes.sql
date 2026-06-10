revoke all on function public.get_lockdown_status() from public;
revoke all on function public.get_lockdown_status() from anon;
grant execute on function public.get_lockdown_status() to authenticated;

revoke all on function public.activate_system_lockdown(text, text[], text[], text[]) from public;
revoke all on function public.activate_system_lockdown(text, text[], text[], text[]) from anon;
grant execute on function public.activate_system_lockdown(text, text[], text[], text[]) to authenticated;

revoke all on function public.deactivate_system_lockdown(text) from public;
revoke all on function public.deactivate_system_lockdown(text) from anon;
grant execute on function public.deactivate_system_lockdown(text) to authenticated;

revoke all on function public.claim_lockdown_emergency_access(text, text) from public;
revoke all on function public.claim_lockdown_emergency_access(text, text) from anon;
grant execute on function public.claim_lockdown_emergency_access(text, text) to authenticated;

revoke all on function public.is_lockdown_session_valid(text) from public;
revoke all on function public.is_lockdown_session_valid(text) from anon;
grant execute on function public.is_lockdown_session_valid(text) to authenticated;

alter function public.normalize_profile_username(text, text)
set search_path = public, pg_temp;

create index if not exists idx_lockdown_state_activated_by
on public.lockdown_state (activated_by);

create index if not exists idx_lockdown_state_deactivated_by
on public.lockdown_state (deactivated_by);

create index if not exists idx_discord_lockdown_commands_triggered_by
on public.discord_lockdown_commands (triggered_by);
