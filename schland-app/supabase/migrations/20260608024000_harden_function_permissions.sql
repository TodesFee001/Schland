alter function public.set_updated_at() set search_path = public;
alter function public.has_mfa_level2() set search_path = public;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_aktualisiert_am'
      and pg_get_function_arguments(p.oid) = ''
  ) then
    alter function public.set_aktualisiert_am() set search_path = public;
  end if;
end $$;

revoke all on function public.handle_new_user_profile() from public;
revoke all on function public.handle_new_user_profile() from anon;
revoke all on function public.handle_new_user_profile() from authenticated;

revoke all on function public.has_permission(text) from public;
revoke all on function public.has_permission(text) from anon;
grant execute on function public.has_permission(text) to authenticated;

revoke all on function public.mark_own_two_factor_enabled() from public;
revoke all on function public.mark_own_two_factor_enabled() from anon;
grant execute on function public.mark_own_two_factor_enabled() to authenticated;

revoke all on function public.open_member_case(uuid, text) from public;
revoke all on function public.open_member_case(uuid, text) from anon;
grant execute on function public.open_member_case(uuid, text) to authenticated;
