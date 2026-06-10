create or replace function public.activate_system_lockdown(
  p_reason text,
  p_recipient_discord_ids text[] default '{}'::text[],
  p_recipient_usernames text[] default array['losoverdrive']::text[],
  p_important_channel_ids text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_bot_last_seen timestamptz;
  v_code text;
  v_command_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null then
    raise exception 'lockdown denied';
  end if;

  if not public.has_permission('lockdown.manage') or not public.has_mfa_level2() then
    raise exception 'lockdown denied';
  end if;

  if v_reason is null or length(v_reason) < 8 then
    raise exception 'lockdown reason required';
  end if;

  select max((metadata #>> '{heartbeat,lastSeenAt}')::timestamptz)
  into v_bot_last_seen
  from public.sync_runs
  where source = 'discord-live'
    and status = 'success'
    and metadata #>> '{heartbeat,lastSeenAt}' is not null;

  if v_bot_last_seen is null or now() - v_bot_last_seen > interval '2 minutes' then
    raise exception 'lockdown bot offline';
  end if;

  select coalesce(display_name, username, email, v_actor_id::text)
  into v_actor_name
  from public.profiles
  where id = v_actor_id;

  v_code := public.generate_lockdown_code();

  update public.lockdown_state
  set
    active = true,
    activated_at = now(),
    activated_by = v_actor_id,
    activated_by_name = v_actor_name,
    deactivated_at = null,
    deactivated_by = null,
    deactivated_by_name = null,
    reason = v_reason,
    emergency_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf', 12)),
    bot_status = 'pending',
    bot_error = null,
    important_channel_ids = coalesce(p_important_channel_ids, '{}'::text[]),
    metadata = jsonb_build_object(
      'lastCommand',
      'activate',
      'botLastSeenAt',
      v_bot_last_seen
    )
  where id = true;

  insert into public.discord_lockdown_commands (
    action,
    reason,
    emergency_code,
    triggered_by,
    triggered_by_name,
    recipient_discord_ids,
    recipient_usernames,
    important_channel_ids
  )
  values (
    'activate',
    v_reason,
    v_code,
    v_actor_id,
    v_actor_name,
    coalesce(p_recipient_discord_ids, '{}'::text[]),
    coalesce(p_recipient_usernames, array['losoverdrive']::text[]),
    coalesce(p_important_channel_ids, '{}'::text[])
  )
  returning id into v_command_id;

  insert into public.systemprotokoll (benutzer_id, aktion, bereich, details)
  values (
    v_actor_id,
    'lockdown_activated',
    'security',
    concat(
      'command=',
      v_command_id::text,
      '; reason=',
      v_reason,
      '; botLastSeenAt=',
      v_bot_last_seen::text
    )
  );

  return v_command_id;
end;
$$;

revoke all on function public.activate_system_lockdown(text, text[], text[], text[]) from public;
revoke all on function public.activate_system_lockdown(text, text[], text[], text[]) from anon;
grant execute on function public.activate_system_lockdown(text, text[], text[], text[]) to authenticated;
