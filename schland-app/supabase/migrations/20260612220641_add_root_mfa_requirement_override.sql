alter table public.profiles
  add column if not exists two_factor_required boolean not null default true,
  add column if not exists two_factor_requirement_updated_at timestamptz,
  add column if not exists two_factor_requirement_updated_by uuid references public.profiles(id) on delete set null;

comment on column public.profiles.two_factor_required is
  'Controls whether this website user must complete MFA/AAL2 after login. Root Owner can disable it per user.';

create index if not exists idx_profiles_two_factor_required
on public.profiles(two_factor_required);

create or replace function public.has_mfa_level2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.two_factor_required = false
    );
$$;

create or replace function public.set_profile_two_factor_required(
  p_user_id uuid,
  p_required boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_changed integer;
begin
  if v_actor_id is null then
    raise exception 'two factor requirement denied';
  end if;

  if not public.has_role('root_owner') then
    raise exception 'two factor requirement denied';
  end if;

  if p_user_id is null or p_required is null then
    raise exception 'profile not found';
  end if;

  update public.profiles
  set
    two_factor_required = p_required,
    two_factor_requirement_updated_at = now(),
    two_factor_requirement_updated_by = v_actor_id,
    updated_at = now()
  where id = p_user_id;

  get diagnostics v_changed = row_count;

  if v_changed = 0 then
    raise exception 'profile not found';
  end if;

  insert into public.systemprotokoll (benutzer_id, aktion, bereich, details)
  values (
    v_actor_id,
    case
      when p_required then 'two_factor_required_enabled'
      else 'two_factor_required_disabled'
    end,
    'users',
    concat('target_user=', p_user_id::text)
  );
end;
$$;

revoke all on function public.has_mfa_level2() from public;
revoke all on function public.has_mfa_level2() from anon;
grant execute on function public.has_mfa_level2() to authenticated;

revoke all on function public.set_profile_two_factor_required(uuid, boolean) from public;
revoke all on function public.set_profile_two_factor_required(uuid, boolean) from anon;
grant execute on function public.set_profile_two_factor_required(uuid, boolean) to authenticated;
