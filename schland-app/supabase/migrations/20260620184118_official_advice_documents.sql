create table if not exists public.official_document_sequences (
  document_kind text not null,
  period_year integer not null,
  period_month integer not null,
  next_sequence_number integer not null,
  updated_at timestamptz not null default now(),
  primary key (document_kind, period_year, period_month),
  constraint official_document_sequences_period_check
    check (period_year between 2020 and 2100 and period_month between 1 and 12),
  constraint official_document_sequences_next_check
    check (next_sequence_number > 0)
);

create table if not exists public.moderation_advice_official_documents (
  id uuid primary key default gen_random_uuid(),
  advice_case_id uuid not null references public.moderation_advice_cases(id) on delete cascade,
  file_id uuid references public.files(id) on delete set null,
  google_drive_file_id text,
  az text not null unique,
  period_month integer not null,
  period_year integer not null,
  sequence_number integer not null,
  issuer text not null default 'KI',
  status text not null default 'created',
  document_type text not null default 'ermittlungsvermerk',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}',
  constraint moderation_advice_official_documents_az_check
    check (az ~ '^BRS/ERM/[0-9]{2,}/[0-9]{2}/[0-9]{4}/[A-Za-zÄÖÜäöüß]+$'),
  constraint moderation_advice_official_documents_period_check
    check (period_year between 2020 and 2100 and period_month between 1 and 12),
  constraint moderation_advice_official_documents_sequence_check
    check (sequence_number > 0),
  constraint moderation_advice_official_documents_status_check
    check (status in ('created', 'failed', 'superseded', 'cancelled')),
  constraint moderation_advice_official_documents_type_check
    check (document_type in ('ermittlungsvermerk', 'sanktionsvorschlag', 'aktennotiz')),
  unique (period_year, period_month, sequence_number)
);

alter table public.moderation_advice_cases
  add column if not exists official_document_id uuid;

alter table public.moderation_advice_cases
  add column if not exists official_az text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'moderation_advice_cases_official_document_id_fkey'
  ) then
    alter table public.moderation_advice_cases
      add constraint moderation_advice_cases_official_document_id_fkey
      foreign key (official_document_id)
      references public.moderation_advice_official_documents(id)
      on delete set null;
  end if;
end $$;

create index if not exists moderation_advice_official_documents_case_idx
on public.moderation_advice_official_documents (advice_case_id, created_at desc);

create index if not exists moderation_advice_official_documents_file_idx
on public.moderation_advice_official_documents (file_id);

create index if not exists moderation_advice_cases_official_document_idx
on public.moderation_advice_cases (official_document_id);

create or replace function public.parse_brs_erm_az(input_value text)
returns table (
  sequence_number integer,
  period_month integer,
  period_year integer,
  issuer text
)
language sql
immutable
as $$
  select
    (match.parts[1])::integer as sequence_number,
    (match.parts[2])::integer as period_month,
    (match.parts[3])::integer as period_year,
    coalesce(nullif(match.parts[4], ''), '') as issuer
  from regexp_matches(
    coalesce(input_value, ''),
    'BRS/ERM/([0-9]{1,})/([0-9]{1,2})/([0-9]{4})/?([A-Za-zÄÖÜäöüß]+)?'
  ) as match(parts);
$$;

create or replace function public.find_max_existing_brs_erm_sequence(
  p_period_year integer,
  p_period_month integer
)
returns integer
language sql
stable
as $$
  with candidates as (
    select original_filename as value
    from public.files
    where original_filename is not null
    union all
    select filename as value
    from public.files
    where filename is not null
    union all
    select az as value
    from public.moderation_advice_official_documents
    where az is not null
  ),
  parsed as (
    select parsed_az.sequence_number, parsed_az.period_month, parsed_az.period_year
    from candidates
    cross join lateral public.parse_brs_erm_az(candidates.value) as parsed_az
  )
  select coalesce(max(sequence_number), 0)
  from parsed
  where period_year = p_period_year
    and period_month = p_period_month;
$$;

create or replace function public.allocate_official_document_az(
  p_document_kind text default 'BRS/ERM',
  p_period_month integer default null,
  p_period_year integer default null,
  p_issuer text default 'KI'
)
returns table (
  az text,
  period_month integer,
  period_year integer,
  sequence_number integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing_max integer;
  v_issuer text := upper(nullif(trim(coalesce(p_issuer, 'KI')), ''));
  v_kind text := nullif(trim(coalesce(p_document_kind, 'BRS/ERM')), '');
  v_month integer := coalesce(
    p_period_month,
    extract(month from timezone('Europe/Berlin', now()))::integer
  );
  v_next integer;
  v_year integer := coalesce(
    p_period_year,
    extract(year from timezone('Europe/Berlin', now()))::integer
  );
begin
  if v_kind <> 'BRS/ERM' then
    raise exception 'unsupported official document kind: %', v_kind;
  end if;

  if v_month < 1 or v_month > 12 or v_year < 2020 or v_year > 2100 then
    raise exception 'invalid official document period';
  end if;

  if v_issuer !~ '^[A-ZÄÖÜ]+$' then
    raise exception 'invalid official document issuer';
  end if;

  select public.find_max_existing_brs_erm_sequence(v_year, v_month)
    into v_existing_max;

  insert into public.official_document_sequences (
    document_kind,
    period_year,
    period_month,
    next_sequence_number
  )
  values (v_kind, v_year, v_month, greatest(v_existing_max + 1, 1))
  on conflict (document_kind, period_year, period_month)
  do update set
    next_sequence_number = greatest(
      public.official_document_sequences.next_sequence_number,
      excluded.next_sequence_number
    ),
    updated_at = now();

  update public.official_document_sequences
  set
    next_sequence_number = next_sequence_number + 1,
    updated_at = now()
  where document_kind = v_kind
    and period_year = v_year
    and period_month = v_month
  returning next_sequence_number - 1 into v_next;

  az := format(
    'BRS/ERM/%s/%s/%s/%s',
    lpad(v_next::text, 2, '0'),
    lpad(v_month::text, 2, '0'),
    v_year::text,
    v_issuer
  );
  period_month := v_month;
  period_year := v_year;
  sequence_number := v_next;

  return next;
end;
$$;

alter table public.official_document_sequences enable row level security;
alter table public.moderation_advice_official_documents enable row level security;

drop policy if exists "official document sequences visible to managers" on public.official_document_sequences;
create policy "official document sequences visible to managers"
on public.official_document_sequences for select
to authenticated
using (public.has_permission('moderation.manage') and public.has_mfa_level2());

drop policy if exists "official document sequences managed by managers" on public.official_document_sequences;
create policy "official document sequences managed by managers"
on public.official_document_sequences for all
to authenticated
using (public.has_permission('moderation.manage') and public.has_mfa_level2())
with check (public.has_permission('moderation.manage') and public.has_mfa_level2());

drop policy if exists "official advice documents visible to moderators" on public.moderation_advice_official_documents;
create policy "official advice documents visible to moderators"
on public.moderation_advice_official_documents for select
to authenticated
using (
  public.has_mfa_level2()
  and (
    public.has_permission('moderation.view')
    or public.has_permission('moderation.manage')
  )
);

drop policy if exists "official advice documents inserted by managers" on public.moderation_advice_official_documents;
create policy "official advice documents inserted by managers"
on public.moderation_advice_official_documents for insert
to authenticated
with check (public.has_permission('moderation.manage') and public.has_mfa_level2());

drop policy if exists "official advice documents updated by managers" on public.moderation_advice_official_documents;
create policy "official advice documents updated by managers"
on public.moderation_advice_official_documents for update
to authenticated
using (public.has_permission('moderation.manage') and public.has_mfa_level2())
with check (public.has_permission('moderation.manage') and public.has_mfa_level2());

drop policy if exists "official advice documents deleted by managers" on public.moderation_advice_official_documents;
create policy "official advice documents deleted by managers"
on public.moderation_advice_official_documents for delete
to authenticated
using (public.has_permission('moderation.manage') and public.has_mfa_level2());

revoke all on table public.official_document_sequences from anon;
revoke all on table public.moderation_advice_official_documents from anon;
revoke all on function public.parse_brs_erm_az(text) from public;
revoke all on function public.find_max_existing_brs_erm_sequence(integer, integer) from public;
revoke all on function public.allocate_official_document_az(text, integer, integer, text) from public;

grant select, insert, update, delete on table public.official_document_sequences to authenticated;
grant select, insert, update, delete on table public.moderation_advice_official_documents to authenticated;
grant execute on function public.parse_brs_erm_az(text) to authenticated;
grant execute on function public.find_max_existing_brs_erm_sequence(integer, integer) to authenticated;
grant execute on function public.allocate_official_document_az(text, integer, integer, text) to authenticated;
