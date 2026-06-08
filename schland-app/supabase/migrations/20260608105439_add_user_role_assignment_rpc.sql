create or replace function public.set_user_role_assignment(
  p_user_id uuid,
  p_role_id uuid,
  p_assign boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_count integer;
  v_changed integer;
  v_role_key text;
begin
  if auth.uid() is null then
    raise exception 'role assignment denied';
  end if;

  if not public.has_permission('users.manage') or not public.has_mfa_level2() then
    raise exception 'role assignment denied';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_user_id
  ) then
    raise exception 'profile not found';
  end if;

  select role_key into v_role_key
  from public.roles
  where id = p_role_id
    and active = true;

  if v_role_key is null then
    raise exception 'role not found';
  end if;

  if p_assign then
    insert into public.user_roles (user_id, role_id)
    values (p_user_id, p_role_id)
    on conflict do nothing;

    get diagnostics v_changed = row_count;
  else
    if v_role_key = 'administrator' then
      select count(distinct ur.user_id) into v_admin_count
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      join public.profiles p on p.id = ur.user_id
      where r.role_key = 'administrator'
        and r.active = true
        and p.status = 'active';

      if v_admin_count <= 1 and exists (
        select 1
        from public.user_roles
        where user_id = p_user_id
          and role_id = p_role_id
      ) then
        raise exception 'cannot remove last administrator';
      end if;
    end if;

    delete from public.user_roles
    where user_id = p_user_id
      and role_id = p_role_id;

    get diagnostics v_changed = row_count;
  end if;

  if v_changed > 0 then
    insert into public.systemprotokoll (benutzer_id, aktion, bereich, details)
    values (
      auth.uid(),
      case when p_assign then 'role_assigned' else 'role_removed' end,
      'users',
      concat('target_user=', p_user_id::text, '; role=', p_role_id::text)
    );
  end if;
end;
$$;

revoke all on function public.set_user_role_assignment(uuid, uuid, boolean) from public;
revoke all on function public.set_user_role_assignment(uuid, uuid, boolean) from anon;
grant execute on function public.set_user_role_assignment(uuid, uuid, boolean) to authenticated;
