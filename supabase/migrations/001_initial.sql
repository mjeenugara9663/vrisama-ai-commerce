-- Vrisama AI Commerce starter schema. Apply in a NEW Supabase project's SQL editor.
-- No client-side service role keys; public storefront reads only published data.
create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 45),
  name text not null check (length(name) between 2 and 100),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members(user_id);

-- Definer helpers prevent recursive RLS policies on org_members.
create function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = (select auth.uid()));
$$;
create function public.is_org_editor(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = (select auth.uid()) and role in ('owner','editor'));
$$;
create function public.is_org_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = (select auth.uid()) and role = 'owner');
$$;

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 45),
  title text not null default 'My storefront' check (length(title) between 2 and 100),
  tagline text not null default 'Discover what we offer' check (length(tagline) <= 260),
  accent text not null default '#56E0CF' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(name) between 2 and 100),
  description text not null default '' check (length(description) <= 1000),
  price_inr numeric(12,2) not null default 0 check (price_inr >= 0),
  image_url text check (image_url is null or image_url ~ '^https://'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index products_org_idx on public.products(org_id, created_at desc);
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  visitor_name text not null check (length(visitor_name) between 2 and 100),
  visitor_email text check (visitor_email is null or length(visitor_email) <= 254),
  visitor_phone text check (visitor_phone is null or length(visitor_phone) <= 25),
  message text not null default '' check (length(message) <= 1000),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'closed')),
  source text not null default 'storefront',
  created_at timestamptz not null default now()
);
create index leads_org_idx on public.leads(org_id, created_at desc);
create table public.marketing_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  channel text not null check (channel in ('instagram', 'facebook', 'whatsapp', 'email')),
  content text not null check (length(content) between 1 and 4000),
  status text not null default 'draft' check (status in ('draft','approved')),
  created_at timestamptz not null default now()
);
create index drafts_org_idx on public.marketing_drafts(org_id, created_at desc);
create table public.subscriptions (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  plan text not null default 'trial' check (plan in ('trial','starter','business','growth')),
  status text not null default 'trialing' check (status in ('trialing','pending','active','authenticated','paused','halted','cancelled','completed')),
  provider_subscription_id text unique,
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
create table public.usage_counters (
  org_id uuid not null references public.organizations(id) on delete cascade,
  month_key date not null,
  ai_requests integer not null default 0 check (ai_requests >= 0),
  primary key (org_id, month_key)
);
create table public.billing_events (
  event_id text primary key,
  subscription_id text not null,
  event_type text not null,
  processed_at timestamptz not null default now()
);

-- Deny table access by default. Explicit grants below combine with RLS.
revoke all on public.organizations, public.org_members, public.sites, public.products, public.leads,
  public.marketing_drafts, public.subscriptions, public.usage_counters, public.billing_events from anon, authenticated;
grant select on public.organizations, public.org_members, public.sites, public.products, public.leads,
  public.marketing_drafts, public.subscriptions, public.usage_counters to authenticated;
grant select on public.sites, public.products to anon;
grant insert, update, delete on public.sites, public.products, public.marketing_drafts to authenticated;
grant update(status) on public.leads to authenticated;

alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.sites enable row level security;
alter table public.products enable row level security;
alter table public.leads enable row level security;
alter table public.marketing_drafts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_counters enable row level security;
alter table public.billing_events enable row level security;

create policy "organizations members can view" on public.organizations for select to authenticated using ((select public.is_org_member(id)));
create policy "members can view memberships" on public.org_members for select to authenticated using ((select public.is_org_member(org_id)));
create policy "public can view published sites" on public.sites for select to anon, authenticated using (published = true);
create policy "members can view unpublished sites" on public.sites for select to authenticated using ((select public.is_org_member(org_id)));
create policy "editors create sites" on public.sites for insert to authenticated with check ((select public.is_org_editor(org_id)));
create policy "editors modify sites" on public.sites for update to authenticated using ((select public.is_org_editor(org_id))) with check ((select public.is_org_editor(org_id)));
create policy "editors delete sites" on public.sites for delete to authenticated using ((select public.is_org_editor(org_id)));
create policy "public sees active products on published sites" on public.products for select to anon, authenticated using (
  is_active and exists(select 1 from public.sites s where s.org_id = products.org_id and s.published)
);
create policy "members see all products" on public.products for select to authenticated using ((select public.is_org_member(org_id)));
create policy "editors create products" on public.products for insert to authenticated with check ((select public.is_org_editor(org_id)));
create policy "editors modify products" on public.products for update to authenticated using ((select public.is_org_editor(org_id))) with check ((select public.is_org_editor(org_id)));
create policy "editors delete products" on public.products for delete to authenticated using ((select public.is_org_editor(org_id)));
create policy "members view leads" on public.leads for select to authenticated using ((select public.is_org_member(org_id)));
create policy "editors update lead status" on public.leads for update to authenticated using ((select public.is_org_editor(org_id))) with check ((select public.is_org_editor(org_id)));
create policy "members view drafts" on public.marketing_drafts for select to authenticated using ((select public.is_org_member(org_id)));
create policy "editors create drafts" on public.marketing_drafts for insert to authenticated with check ((select public.is_org_editor(org_id)) and created_by = (select auth.uid()) and status = 'draft');
create policy "editors update drafts" on public.marketing_drafts for update to authenticated using ((select public.is_org_editor(org_id))) with check ((select public.is_org_editor(org_id)));
create policy "editors delete drafts" on public.marketing_drafts for delete to authenticated using ((select public.is_org_editor(org_id)));
create policy "owners view subscriptions" on public.subscriptions for select to authenticated using ((select public.is_org_owner(org_id)));
create policy "editors view usage" on public.usage_counters for select to authenticated using ((select public.is_org_editor(org_id)));

-- Onboard one workspace atomically; a customer may have multiple tenants.
create function public.create_organization(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if length(trim(p_name)) not between 2 and 100 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) not between 3 and 45 then
    raise exception 'Invalid business name or slug';
  end if;
  if (select count(*) from public.organizations where owner_id = v_user) >= 5 then
    raise exception 'Workspace limit reached; contact support';
  end if;
  insert into public.organizations(name, slug, owner_id) values (trim(p_name), p_slug, v_user) returning id into v_org;
  insert into public.org_members(org_id, user_id, role) values (v_org, v_user, 'owner');
  insert into public.sites(org_id, slug, title) values (v_org, p_slug, trim(p_name));
  insert into public.subscriptions(org_id) values (v_org);
  return v_org;
end; $$;

-- Count requests atomically; avoids parallel requests bypassing an AI budget.
create function public.consume_ai_credit(p_org uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_plan text; v_limit integer; v_month date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  if not public.is_org_editor(p_org) then return false; end if;
  select case when status = 'trialing' and trial_ends_at > now() then 'trial'
              when status = 'active' then plan else null end
  into v_plan from public.subscriptions where org_id = p_org;
  v_limit := case v_plan when 'trial' then 10 when 'starter' then 50 when 'business' then 300 when 'growth' then 1000 else 0 end;
  if v_limit = 0 then return false; end if;
  insert into public.usage_counters(org_id, month_key, ai_requests) values (p_org, v_month, 0) on conflict do nothing;
  update public.usage_counters set ai_requests = ai_requests + 1
  where org_id = p_org and month_key = v_month and ai_requests < v_limit;
  return found;
end; $$;

-- Called ONLY via service-role webhook handler after verified Razorpay HMAC.
create function public.apply_billing_event(p_event_id text, p_subscription_id text, p_event_type text,
  p_status text, p_period_end timestamptz default null) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.subscriptions where provider_subscription_id = p_subscription_id) then return false; end if;
  insert into public.billing_events(event_id, subscription_id, event_type)
  values (p_event_id, p_subscription_id, p_event_type) on conflict do nothing;
  if not found then return true; end if;
  update public.subscriptions set status = p_status, updated_at = now(),
    current_period_end = coalesce(p_period_end, current_period_end)
  where provider_subscription_id = p_subscription_id;
  return true;
end; $$;

revoke all on function public.is_org_member(uuid), public.is_org_editor(uuid), public.is_org_owner(uuid),
  public.create_organization(text,text), public.consume_ai_credit(uuid),
  public.apply_billing_event(text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.is_org_member(uuid), public.is_org_editor(uuid), public.is_org_owner(uuid),
  public.create_organization(text,text), public.consume_ai_credit(uuid) to authenticated;
grant execute on function public.apply_billing_event(text,text,text,text,timestamptz) to service_role;
