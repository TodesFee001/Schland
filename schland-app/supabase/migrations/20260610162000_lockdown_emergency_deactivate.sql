drop function if exists public.deactivate_system_lockdown(text);

create or replace function public.deactivate_system_lockdown(
  p_reason text,
  p_emergency_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_code text := nullif(trim(coalesce(p_emergency_code, '')), '');
  v_code_hash text;
  v_command_id uuid;
  v_has_emergency_access boolean := false;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null then
    raise exception 'lockdown denied';
  end if;

  if v_reason is null or length(v_reason) < 8 then
    raise exception 'lockdown reason required';
  end if;

  select coalesce(display_name, username, email, v_actor_id::text)
  into v_actor_name
  from public.profiles
  where id = v_actor_id
    and status = 'active';

  if v_actor_name is null then
    raise exception 'lockdown denied';
  end if;

  select emergency_code_hash
  into v_code_hash
  from public.lockdown_state
  where id = true
    and active = true;

  if v_code_hash is not null
    and v_code is not null
    and extensions.crypt(v_code, v_code_hash) = v_code_hash then
    v_has_emergency_access := true;
  end if;

  if not v_has_emergency_access
    and (not public.has_permission('lockdown.manage') or not public.has_mfa_level2()) then
    raise exception 'lockdown denied';
  end if;

  update public.lockdown_state
  set
    active = false,
    deactivated_at = now(),
    deactivated_by = v_actor_id,
    deactivated_by_name = v_actor_name,
    emergency_code_hash = null,
    bot_status = 'restore_pending',
    bot_error = null,
    metadata = metadata || jsonb_build_object(
      'lastCommand',
      'deactivate',
      'emergencyCodeUsed',
      v_has_emergency_access
    )
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
  values (
    v_actor_id,
    'lockdown_deactivated',
    'security',
    concat(
      'command=',
      v_command_id::text,
      '; reason=',
      v_reason,
      '; emergency=',
      v_has_emergency_access::text
    )
  );

  return v_command_id;
end;
$$;

revoke all on function public.deactivate_system_lockdown(text, text) from public;
revoke all on function public.deactivate_system_lockdown(text, text) from anon;
grant execute on function public.deactivate_system_lockdown(text, text) to authenticated;
