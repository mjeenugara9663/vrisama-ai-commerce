-- Search-insights tests (run after isolation.sql in the same disposable database).
\set ON_ERROR_STOP 1
\set QUIET 1
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set B2 '00000000-0000-0000-0000-0000000000b2'
\set V2 '00000000-0000-0000-0000-0000000000c2'
insert into auth.users(id,email) values (:'A2','a2@test'),(:'B2','b2@test'),(:'V2','v2@test');
set role authenticated; select tt.as_user(:'A2'); select public.create_organization('Search Alpha','search-alpha') as oa \gset
select tt.as_user(:'B2'); select public.create_organization('Search Beta','search-beta') as ob \gset
reset role;
insert into org_members(org_id,user_id,role) values (:'oa',:'V2','viewer');

-- server writes (service role)
set role service_role;
insert into store_searches(org_id,term,results) values (:'oa','silk saree',0),(:'oa','silk saree',0),(:'oa','kurta',3),(:'ob','secret beta term',1);
select tt.expect(public.replace_search_queries(:'oa', '[{"query":"buy sarees online","clicks":4,"impressions":120,"ctr":0.033,"position":8.2},{"query":"","clicks":1}]'::jsonb, '2026-09-01','2026-09-28') = 1, 'replace_search_queries stores valid rows and skips empty queries');
select tt.expect(public.replace_search_queries(:'oa', '[{"query":"fresh","clicks":1,"impressions":10,"ctr":0.1,"position":3}]'::jsonb, '2026-09-02','2026-09-29') = 1, 'replace_search_queries replaces the previous snapshot');
select tt.expect((select count(*) from search_queries where org_id=:'oa')=1, 'no stale queries remain');
select tt.expect(public.prune_search_data() = 0, 'prune keeps recent searches');
reset role;
update store_searches set created_at = now() - interval '100 days' where term='kurta';
set role service_role; select tt.expect(public.prune_search_data() = 1, 'prune deletes searches older than 90 days'); reset role;

-- owner A2 sees their own data via the summary function
set role authenticated; select tt.as_user(:'A2');
select tt.expect((select searches from public.store_search_summary(:'oa',30) where term='silk saree')=2, 'owner sees aggregated search counts');
select tt.expect((select no_result_searches from public.store_search_summary(:'oa',30) where term='silk saree')=2, 'owner sees no-result searches');
select tt.expect((select count(*) from search_queries where org_id=:'oa')=1, 'owner sees Google queries');
select tt.expect((select count(*) from public.store_search_summary(:'ob',30))=0, 'owner A cannot see B search terms through the function');
select tt.expect((select count(*) from store_searches where org_id=:'ob')=0, 'owner A cannot read B raw searches');
select tt.denied(format('insert into store_searches(org_id,term,results) values (%L,''forged'',1)', :'oa'), 'client cannot forge search logs');
select tt.denied(format('insert into search_queries(org_id,query) values (%L,''forged'')', :'oa'), 'client cannot forge Google queries');
select tt.denied(format('select public.replace_search_queries(%L,''[]''::jsonb,''2026-01-01'',''2026-01-02'')', :'oa'), 'client cannot call replace_search_queries');
select tt.denied('select public.prune_search_data()', 'client cannot call prune_search_data');
reset role;
-- viewer (non-editor) cannot see search data
set role authenticated; select tt.as_user(:'V2');
select tt.expect((select count(*) from public.store_search_summary(:'oa',30))=0, 'viewer cannot read search summary');
select tt.expect((select count(*) from search_queries where org_id=:'oa')=0, 'viewer cannot read Google queries');
reset role;
-- anonymous visitors see nothing
set role anon;
select tt.denied('select * from store_searches', 'anon reads store_searches');
select tt.denied('select * from search_queries', 'anon reads search_queries');
select tt.denied(format('select * from public.store_search_summary(%L,30)', :'oa'), 'anon calls summary');
reset role;
-- lead search_term bounds
select tt.denied(format('insert into leads(org_id,site_id,visitor_name,visitor_phone,search_term) select org_id,id,''X Y'',''1'',%L from sites where org_id=%L', repeat('x',81), :'oa'), 'search_term > 80 chars rejected');
insert into leads(org_id,site_id,visitor_name,visitor_phone,search_term,source) select org_id,id,'Searcher','99999','silk saree','storefront-search' from sites where org_id=:'oa';
select tt.expect((select count(*) from leads where search_term='silk saree')=1, 'lead stores the search term that led to it');
\echo SEARCH SQL TESTS PASSED
