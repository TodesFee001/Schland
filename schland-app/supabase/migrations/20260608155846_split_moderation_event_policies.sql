drop policy if exists "moderation events visible to moderators" on public.discord_moderation_events;
drop policy if exists "moderation events managed by sync managers" on public.discord_moderation_events;

create policy "moderation events visible to moderators"
on public.discord_moderation_events for select
to authenticated
using (
  public.has_mfa_level2()
  and (
    public.has_permission('moderation.view')
    or public.has_permission('moderation.manage')
  )
);

create policy "moderation events inserted by sync managers"
on public.discord_moderation_events for insert
to authenticated
with check (public.has_permission('moderation.manage') and public.has_mfa_level2());

create policy "moderation events updated by sync managers"
on public.discord_moderation_events for update
to authenticated
using (public.has_permission('moderation.manage') and public.has_mfa_level2())
with check (public.has_permission('moderation.manage') and public.has_mfa_level2());

create policy "moderation events deleted by sync managers"
on public.discord_moderation_events for delete
to authenticated
using (public.has_permission('moderation.manage') and public.has_mfa_level2());
