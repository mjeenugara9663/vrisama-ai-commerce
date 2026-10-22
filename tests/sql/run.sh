#!/usr/bin/env bash
# Usage: tests/sql/run.sh <psql connection args...>   e.g.  tests/sql/run.sh -h /tmp -p 54329 -U postgres
# Creates a throwaway database "vrisama_test", mocks Supabase's auth schema/roles, applies migrations, runs tests.
# NEVER point this at a real project. Requires a local PostgreSQL (>=15).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../.."
P=(psql "$@" -v ON_ERROR_STOP=1 -q)
"${P[@]}" -d postgres -c "drop database if exists vrisama_test" -c "create database vrisama_test"
"${P[@]}" -d postgres -c "do \$\$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end \$\$"
"${P[@]}" -d vrisama_test -f "$HERE/supabase_shim.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do echo "applying $(basename "$m")"; "${P[@]}" -d vrisama_test -f "$m"; done
if out=$(for t in isolation search; do "${P[@]}" -d vrisama_test -f "$HERE/$t.sql" 2>&1 || exit 1; done); then
  echo "$out" | grep -c "NOTICE:  ok - " | xargs -I{} echo "{} assertions passed"
  echo "RESULT: PASS"
else
  echo "$out" | tail -15; echo "RESULT: FAIL"; exit 1
fi
