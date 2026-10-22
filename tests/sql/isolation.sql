-- Tenant-isolation & billing-logic tests. Run against a DISPOSABLE database that already has
-- the Supabase `auth` schema/roles and migrations 001 + 002 applied (see tests/sql/run.sh).
-- Any failed assertion raises an exception and aborts the run (psql ON_ERROR_STOP).
\set ON_ERROR_STOP 1
\set QUIET 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set V '00000000-0000-0000-0000-00000000000c'

create schema tt; grant usage on schema tt to public;
create or replace function tt.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u,''), false); end $$;
create or replace function tt.expect(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'TEST FAILED: %', msg; end if; raise notice 'ok - %', msg; end $$;
-- expect a statement to fail with an error (permission denied / RLS / exception)
create or replace function tt.denied(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok - % (%)', msg, sqlerrm; return; end;
  raise exception 'TEST FAILED: % was allowed', msg;
end $$;
create or replace function tt.affects_zero(stmt text, msg text) returns void language plpgsql as $$
declare n int;
begin
  begin execute stmt; get diagnostics n = row_count; exception when others then raise notice 'ok - % (error)', msg; return; end;
  if n <> 0 then raise exception 'TEST FAILED: % changed % rows', msg, n; end if;
  raise notice 'ok - % (0 rows)', msg;
end $$;


insert into auth.users(id,email) values (:'A','a@test'),(:'B','b@test'),(:'V','viewer@test');

-- ===== onboarding =====
set role authenticated;
select tt.as_user(:'A'); select public.create_organization('Alpha Shop','alpha-shop') as org_a \gset
select tt.as_user(:'B'); select public.create_organization('Beta Shop','beta-shop') as org_b \gset
reset role;
select set_config('t.org_a', :'org_a', false), set_config('t.org_b', :'org_b', false) \gset
insert into org_members(org_id,user_id,role) values (:'org_a',:'V','viewer');
insert into products(org_id,name,price_inr) values (:'org_a','Kurta',999),(:'org_b','Saree',1999);
insert into products(org_id,name,price_inr,is_active) values (:'org_a','Hidden item',5,false);
insert into leads(org_id,site_id,visitor_name,visitor_phone) select org_id,id,'Lead One','999999' from sites where org_id=:'org_a';
insert into marketing_drafts(org_id,created_by,channel,content) values (:'org_a',:'A','email','secret draft');

-- ===== B cannot see or touch A =====
set role authenticated; select tt.as_user(:'B');
select tt.expect((select count(*) from organizations)=1, 'B sees only own organization');
select tt.expect((select count(*) from products where org_id=:'org_a')=0, 'B cannot read A products');
select tt.expect((select count(*) from leads where org_id=:'org_a')=0, 'B cannot read A leads');
select tt.expect((select count(*) from marketing_drafts where org_id=:'org_a')=0, 'B cannot read A drafts');
select tt.expect((select count(*) from subscriptions where org_id=:'org_a')=0, 'B cannot read A subscription');
select tt.expect((select count(*) from org_members where org_id=:'org_a')=0, 'B cannot see A members');
select tt.expect((select count(*) from sites where org_id=:'org_a')=0, 'B cannot see A unpublished site');
select tt.affects_zero(format('update products set name=''x'' where org_id=%L', :'org_a'), 'B update A products');
select tt.affects_zero(format('update sites set title=''xx'' where org_id=%L', :'org_a'), 'B update A site');
select tt.affects_zero(format('update leads set status=''closed'' where org_id=%L', :'org_a'), 'B update A leads');
select tt.affects_zero(format('delete from products where org_id=%L', :'org_a'), 'B delete A products');
select tt.denied(format('insert into products(org_id,name) values (%L,''evil'')', :'org_a'), 'B insert product into A');
select tt.denied(format('insert into org_members(org_id,user_id,role) values (%L,%L,''owner'')', :'org_a', :'B'), 'B self-adds as owner of A');
select tt.denied(format('insert into marketing_drafts(org_id,created_by,channel,content) values (%L,%L,''email'',''x'')', :'org_a', :'B'), 'B insert draft into A');
select tt.expect(public.consume_ai_credit(:'org_a') = false, 'B cannot spend A AI credits');
select tt.denied('insert into organizations(slug,name,owner_id) values (''sneaky'',''Sneaky'', auth.uid())', 'direct org insert (must use RPC)');
select tt.denied(format('update subscriptions set status=''active'' where org_id=%L', :'org_b'), 'owner cannot self-activate subscription');
select tt.denied('insert into billing_events(event_id,subscription_id,event_type) values (''e'',''s'',''t'')', 'client writes billing_events');
select tt.denied(format('select public.apply_billing_event(''e1'',''s'',''t'',''active'')'), 'client calls apply_billing_event');
select tt.denied(format('select public.attach_subscription(%L,''sub_x'',''growth'')', :'org_b'), 'client calls attach_subscription');
select tt.denied('select public.hit_rate_limit(''k'',1,60)', 'client calls hit_rate_limit');
select tt.denied('select * from rate_limits', 'client reads rate_limits');
select tt.denied('select * from retired_subscriptions', 'client reads retired_subscriptions');
reset role;

-- ===== viewer role =====
set role authenticated; select tt.as_user(:'V');
select tt.expect((select count(*) from products where org_id=:'org_a')=2, 'viewer reads all A products (incl. hidden)');
select tt.expect((select count(*) from leads where org_id=:'org_a')=1, 'viewer reads leads');
select tt.expect((select count(*) from subscriptions where org_id=:'org_a')=0, 'viewer cannot read subscription (owner only)');
select tt.denied(format('insert into products(org_id,name) values (%L,''nope'')', :'org_a'), 'viewer insert product');
select tt.affects_zero(format('update sites set title=''viewer'' where org_id=%L', :'org_a'), 'viewer update site');
select tt.affects_zero(format('update leads set status=''closed'' where org_id=%L', :'org_a'), 'viewer update lead');
select tt.expect(public.consume_ai_credit(:'org_a') = false, 'viewer cannot spend AI credits');
reset role;

-- ===== public storefront =====
set role anon;
select tt.expect((select count(*) from sites)=0, 'anon sees no unpublished sites');
select tt.expect((select count(*) from products)=0, 'anon sees no products of unpublished sites');
select tt.denied('select * from leads', 'anon reads leads');
select tt.denied('select * from subscriptions', 'anon reads subscriptions');
select tt.denied('insert into leads(org_id,site_id,visitor_name) select org_id,id,''spam'' from sites', 'anon inserts leads directly');
reset role;
set role authenticated; select tt.as_user(:'A');
update sites set published=true where org_id=:'org_a';
reset role;
set role anon;
select tt.expect((select count(*) from sites)=1, 'anon sees published site A only');
select tt.expect((select count(*) from products where org_id=:'org_a')=1, 'anon sees only ACTIVE products of published A');
select tt.expect((select count(*) from products where org_id=:'org_b')=0, 'anon sees no products of unpublished B');
reset role;

-- ===== AI credits (trial = 10) =====
set role authenticated; select tt.as_user(:'A');
do $$ declare i int; ok boolean; begin
  for i in 1..10 loop ok := public.consume_ai_credit(current_setting('t.org_a')::uuid);
    if not ok then raise exception 'TEST FAILED: credit % denied during trial', i; end if; end loop;
  if public.consume_ai_credit(current_setting('t.org_a')::uuid) then raise exception 'TEST FAILED: 11th trial credit allowed'; end if;
  perform public.refund_ai_credit(current_setting('t.org_a')::uuid);
  if not public.consume_ai_credit(current_setting('t.org_a')::uuid) then raise exception 'TEST FAILED: refund did not restore a credit'; end if;
  raise notice 'ok - trial quota enforced at 10; refund restores one credit';
end $$;
reset role;

-- ===== entitlement lapse =====
update subscriptions set trial_ends_at = now() - interval '1 day' where org_id=:'org_a';
select tt.expect(public.org_entitled(:'org_a') = false, 'expired trial is not entitled');
set role anon;
select tt.expect((select count(*) from sites)=0, 'lapsed workspace storefront hidden from public');
select tt.expect((select count(*) from products)=0, 'lapsed workspace catalog hidden from public');
reset role;
set role authenticated; select tt.as_user(:'A');
select tt.expect(public.consume_ai_credit(:'org_a') = false, 'lapsed workspace cannot use AI');
select tt.expect((select count(*) from sites where org_id=:'org_a')=1, 'owner can still see own site when lapsed');
reset role;

-- ===== billing events (service role) =====
set role service_role;
select public.attach_subscription(:'org_a','sub_1','starter');
select tt.expect(public.apply_billing_event('evt_1','sub_1','subscription.activated','active', now()+interval '30 days', now()) = 'applied', 'activation applied');
select tt.expect(public.apply_billing_event('evt_1','sub_1','subscription.activated','active', null, now()) = 'duplicate', 'duplicate event ignored');
select tt.expect(public.org_entitled(:'org_a'), 'active subscription is entitled');
select tt.expect(public.apply_billing_event('evt_old','sub_1','subscription.halted','halted', null, now()-interval '1 hour') = 'stale', 'older event is stale');
select tt.expect((select status from subscriptions where org_id=:'org_a')='active', 'stale event did not overwrite state');
select tt.expect(public.apply_billing_event('evt_2','sub_1','subscription.cancelled','cancelled', null, now()+interval '1 second') = 'applied', 'newer cancellation applied');
select tt.expect(public.apply_billing_event('evt_late','sub_1','subscription.charged','active', null, now()-interval '5 minutes') = 'stale', 'late charge cannot resurrect cancelled sub');
select tt.expect((select status from subscriptions where org_id=:'org_a')='cancelled', 'status remains cancelled');
select tt.expect(public.org_entitled(:'org_a'), 'cancelled but paid-through period still entitled');
select tt.expect(public.apply_billing_event('evt_x','sub_unknown','subscription.activated','active') = 'unknown', 'unknown subscription reported');
select public.attach_subscription(:'org_a','sub_2','business');
select tt.expect(public.apply_billing_event('evt_3','sub_1','subscription.activated','active') = 'retired', 'replaced subscription events are retired');
select tt.expect(public.hit_rate_limit('ip:1',3,60) and public.hit_rate_limit('ip:1',3,60) and public.hit_rate_limit('ip:1',3,60), 'rate limit allows up to limit');
select tt.expect(public.hit_rate_limit('ip:1',3,60) = false, 'rate limit blocks beyond limit');
select tt.expect(public.hit_rate_limit('ip:2',3,60), 'rate limit is per key');
reset role;

-- ===== abuse limits =====
insert into products(org_id,name) select :'org_b','bulk '||g from generate_series(1,498) g;   -- 1 existing + 498 = 499
insert into products(org_id,name) values (:'org_b','p500');
select tt.denied(format('insert into products(org_id,name) values (%L,''p501'')', :'org_b'), 'product limit (500) enforced');
set role authenticated; select tt.as_user(:'B');
do $$ declare i int; begin
  for i in 2..5 loop perform public.create_organization('Biz '||i, 'biz-slug-'||i); end loop;
  begin perform public.create_organization('Biz 6','biz-slug-6'); raise exception 'TEST FAILED: 6th workspace allowed';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
  raise notice 'ok - workspace limit (5) enforced';
end $$;
reset role;
\echo ALL SQL TESTS PASSED
