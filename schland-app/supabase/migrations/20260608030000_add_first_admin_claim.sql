create or replace function public.claim_first_administrator()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role_id uuid;
  v_existing_admins integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext('schland_first_admin_claim'));

  select count(*)
  into v_existing_admins
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where r.role_key = 'administrator';

  if v_existing_admins > 0 then
    return false;
  end if;

  select id
  into v_role_id
  from public.roles
  where role_key = 'administrator'
    and active = true
  limit 1;

  if v_role_id is null then
    raise exception 'administrator role not found';
  end if;

  insert into public.profiles (
    id,
    display_name,
    email,
    status
  )
  select
    au.id,
    coalesce(
      au.raw_user_meta_data ->> 'display_name',
      split_part(coalesce(au.email, 'benutzer'), '@', 1)
    ),
    au.email,
    'active'
  from auth.users au
  where au.id = v_user_id
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  insert into public.user_roles (user_id, role_id)
  values (v_user_id, v_role_id)
  on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.claim_first_administrator() from public;
revoke all on function public.claim_first_administrator() from anon;
grant execute on function public.claim_first_administrator() to authenticated;
