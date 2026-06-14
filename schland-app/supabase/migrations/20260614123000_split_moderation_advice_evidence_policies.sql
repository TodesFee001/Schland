drop policy if exists "moderation advice evidence managed by managers" on public.moderation_advice_evidence;

create policy "moderation advice evidence inserted by managers"
on public.moderation_advice_evidence for insert
to authenticated
with check (public.has_permission('moderation.manage') and public.has_mfa_level2());

create policy "moderation advice evidence updated by managers"
on public.moderation_advice_evidence for update
to authenticated
using (public.has_permission('moderation.manage') and public.has_mfa_level2())
with check (public.has_permission('moderation.manage') and public.has_mfa_level2());

create policy "moderation advice evidence deleted by managers"
on public.moderation_advice_evidence for delete
to authenticated
using (public.has_permission('moderation.manage') and public.has_mfa_level2());
