-- Vrisama AI Commerce 003: search insights for lead generation.
-- Apply AFTER 001 and 002.
-- Stores (a) anonymous on-site search terms, (b) cached Google Search Console queries per storefront,
-- and (c) the search term that led to a lead. No IP addresses or visitor identifiers are stored with searches.

alter table public.leads add column search_term text check (search_term is null or length(search_term) <= 80);

-- ---------------------------------------------------------------------------
-- On-site searches (anonymous). Written only by the server (service role).
-- ---------------------------------------------------------------------------
create table public.store_searches (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  term text not null check (length(term) between 2 and 80),
  results integer not null check (results >= 0),
  created_at timestamptz not null default now()
);
create index store_searches_org_idx on public.store_searches(org_id, created_at desc);
alter table public.store_searches enable row level security;
revoke all on public.store_searches from anon, authenticated;
grant select on public.store_searches to authenticated;
create policy "editors view store searches" on public.store_searches for select to authenticated
  using ((select public.is_org_editor(org_id)));

-- Aggregated view for the dashboard. SECURITY INVOKER: row-level security still applies to the caller.
create function public.store_search_summary(p_org uuid, p_days integer default 30)
returns table(term text, searches bigint, no_result_searches bigint, last_seen timestamptz)
language sql stable security invoker set search_path = '' as $$
  select s.term, count(*), count(*) filter (where s.results = 0), max(s.created_at)
  from public.store_searches s
  where s.org_id = p_org and s.created_at > now() - make_interval(days => least(greatest(p_days, 1), 365))
  group by s.term
  order by count(*) desc, max(s.created_at) desc
  limit 50;
$$;

-- ---------------------------------------------------------------------------
-- Google Search Console snapshot per storefront (refreshed by the daily sync job).
-- ---------------------------------------------------------------------------
create table public.search_queries (
  org_id uuid not null references public.organizations(id) on delete cascade,
  query text not null check (length(query) between 1 and 300),
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr double precision not null default 0,
  position double precision not null default 0,
  period_start date not null,
  period_end date not null,
  synced_at timestamptz not null default now(),
  primary key (org_id, query)
);
alter table public.search_queries enable row level security;
revoke all on public.search_queries from anon, authenticated;
grant select on public.search_queries to authenticated;
create policy "editors view search queries" on public.search_queries for select to authenticated
  using ((select public.is_org_editor(org_id)));

create function public.replace_search_queries(p_org uuid, p_rows jsonb, p_start date, p_end date) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  delete from public.search_queries where org_id = p_org;
  insert into public.search_queries(org_id, query, clicks, impressions, ctr, position, period_start, period_end)
  select p_org, left(x.query, 300), coalesce(x.clicks, 0), coalesce(x.impressions, 0), coalesce(x.ctr, 0), coalesce(x.position, 0), p_start, p_end
  from jsonb_to_recordset(p_rows) as x(query text, clicks integer, impressions integer, ctr double precision, position double precision)
  where x.query is not null and length(x.query) > 0
  limit 200
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

-- Retention: on-site search logs are kept 90 days.
create function public.prune_search_data() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  delete from public.store_searches where created_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

revoke all on function public.store_search_summary(uuid, integer), public.replace_search_queries(uuid, jsonb, date, date),
  public.prune_search_data() from public, anon, authenticated;
grant execute on function public.store_search_summary(uuid, integer) to authenticated;
grant execute on function public.replace_search_queries(uuid, jsonb, date, date), public.prune_search_data() to service_role;
