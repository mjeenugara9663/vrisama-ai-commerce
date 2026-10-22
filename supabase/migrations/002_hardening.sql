-- Vrisama AI Commerce 002: billing ordering, plan entitlements, durable rate limits, abuse controls.
-- Apply AFTER 001_initial.sql. Safe to run once; review before applying to a database with live data.

-- ---------------------------------------------------------------------------
-- 1. Billing: event ordering + retired subscriptions
-- ---------------------------------------------------------------------------
alter table public.subscriptions add column if not exists last_event_at timestamptz;

-- Provider subscriptions that were replaced (abandoned checkout). Late webhooks for them are acknowledged and ignored.
create table public.retired_subscriptions (
  provider_subscription_id text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  retired_at timestamptz not null default now()
);
alter table public.retired_subscriptions enable row level security;
revoke all on public.retired_subscriptions from anon, authenticated;

drop function public.apply_billing_event(text, text, text, text, timestamptz);
create function public.apply_billing_event(
  p_event_id text, p_subscription_id text, p_event_type text, p_status text,
  p_period_end timestamptz default null, p_event_at timestamptz default now()
) returns text   -- 'applied' | 'duplicate' | 'stale' | 'retired' | 'unknown'
language plpgsql security definer set search_path = '' as $$
declare v_rows integer;
begin
  if exists (select 1 from public.retired_subscriptions where provider_subscription_id = p_subscription_id) then
    return 'retired';
  end if;
  if not exists (select 1 from public.subscriptions where provider_subscription_id = p_subscription_id) then
    return 'unknown';
  end if;
  insert into public.billing_events(event_id, subscription_id, event_type)
  values (p_event_id, p_subscription_id, p_event_type) on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return 'duplicate'; end if;
  -- Out-of-order protection: never let an older event overwrite newer state.
  update public.subscriptions
     set status = p_status, updated_at = now(),
         current_period_end = coalesce(p_period_end, current_period_end),
         last_event_at = p_event_at
   where provider_subscription_id = p_subscription_id
     and (last_event_at is null or p_event_at >= last_event_at);
  get diagnostics v_rows = row_count;
  return case when v_rows = 1 then 'applied' else 'stale' end;
end; $$;

-- Atomically attach a (new) provider subscription to a workspace, retiring any previous one.
create function public.attach_subscription(p_org uuid, p_new text, p_plan text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  select provider_subscription_id into v_old from public.subscriptions where org_id = p_org for update;
  if not found then raise exception 'No subscription record for workspace'; end if;
  if v_old is not null and v_old <> p_new then
    insert into public.retired_subscriptions(provider_subscription_id, org_id) values (v_old, p_org) on conflict do nothing;
  end if;
  update public.subscriptions set plan = p_plan, provider_subscription_id = p_new, updated_at = now() where org_id = p_org;
end; $$;

-- ---------------------------------------------------------------------------
-- 2. Entitlements: what a workspace may do given its billing state
-- ---------------------------------------------------------------------------
create function public.org_entitled(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (status = 'trialing' and trial_ends_at > now())
        or status in ('active', 'authenticated')
        or (status = 'cancelled' and current_period_end is not null and current_period_end > now())
    from public.subscriptions where org_id = p_org
  ), false);
$$;

-- Public storefront + catalog are visible only while the workspace is entitled.
drop policy "public can view published sites" on public.sites;
create policy "public can view published sites" on public.sites for select to anon, authenticated
  using (published = true and (select public.org_entitled(org_id)));
drop policy "public sees active products on published sites" on public.products;
create policy "public sees active products on published sites" on public.products for select to anon, authenticated using (
  is_active and (select public.org_entitled(org_id))
  and exists(select 1 from public.sites s where s.org_id = products.org_id and s.published)
);

-- AI credits also work for authenticated/cancelled-but-paid-through workspaces.
create or replace function public.consume_ai_credit(p_org uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_plan text; v_limit integer; v_month date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  if not public.is_org_editor(p_org) then return false; end if;
  select case when status = 'trialing' and trial_ends_at > now() then 'trial'
              when status in ('active', 'authenticated') then plan
              when status = 'cancelled' and current_period_end > now() then plan
              else null end
  into v_plan from public.subscriptions where org_id = p_org;
  v_limit := case v_plan when 'trial' then 10 when 'starter' then 50 when 'business' then 300 when 'growth' then 1000 else 0 end;
  if v_limit = 0 then return false; end if;
  insert into public.usage_counters(org_id, month_key, ai_requests) values (p_org, v_month, 0) on conflict do nothing;
  update public.usage_counters set ai_requests = ai_requests + 1
  where org_id = p_org and month_key = v_month and ai_requests < v_limit;
  return found;
end; $$;

-- Give a credit back when the provider call fails, so customers are not charged for errors.
create function public.refund_ai_credit(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_month date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  if not public.is_org_editor(p_org) then return; end if;
  update public.usage_counters set ai_requests = greatest(ai_requests - 1, 0)
  where org_id = p_org and month_key = v_month;
end; $$;

-- ---------------------------------------------------------------------------
-- 3. Durable rate limiting (fixed window). Service-role only.
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_start timestamptz; v_hits integer;
begin
  if p_window_seconds < 1 or p_limit < 1 then raise exception 'Invalid rate limit'; end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits(key, window_start, hits) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  if random() < 0.02 then delete from public.rate_limits where window_start < now() - interval '1 day'; end if;
  return v_hits <= p_limit;
end; $$;

-- ---------------------------------------------------------------------------
-- 4. Abuse controls: bounded catalog size per workspace
-- ---------------------------------------------------------------------------
create function public.enforce_product_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.products where org_id = new.org_id) >= 500 then
    raise exception 'Product limit reached (500 per workspace)';
  end if;
  return new;
end; $$;
create trigger products_limit before insert on public.products for each row execute function public.enforce_product_limit();

-- ---------------------------------------------------------------------------
-- 5. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.apply_billing_event(text,text,text,text,timestamptz,timestamptz),
  public.attach_subscription(uuid,text,text), public.org_entitled(uuid), public.refund_ai_credit(uuid),
  public.hit_rate_limit(text,integer,integer), public.enforce_product_limit() from public, anon, authenticated;
grant execute on function public.apply_billing_event(text,text,text,text,timestamptz,timestamptz),
  public.attach_subscription(uuid,text,text), public.hit_rate_limit(text,integer,integer) to service_role;
grant execute on function public.org_entitled(uuid) to anon, authenticated, service_role;
grant execute on function public.refund_ai_credit(uuid) to authenticated;
