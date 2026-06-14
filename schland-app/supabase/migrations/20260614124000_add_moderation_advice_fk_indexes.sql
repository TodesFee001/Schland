create index if not exists moderation_advice_cases_submitted_by_idx
on public.moderation_advice_cases (submitted_by);

create index if not exists moderation_advice_cases_executed_by_idx
on public.moderation_advice_cases (executed_by);

create index if not exists moderation_advice_evidence_file_idx
on public.moderation_advice_evidence (file_id);

create index if not exists moderation_advice_evidence_uploaded_by_idx
on public.moderation_advice_evidence (uploaded_by);

create index if not exists moderation_advice_logs_actor_idx
on public.moderation_advice_logs (actor_profile_id);
