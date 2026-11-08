#!/usr/bin/env bash
# Runs each SQL test file against a fresh database with the shim and all
# migrations applied.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=bank_of_dad_test

fresh_db() {
  psql -q -v ON_ERROR_STOP=1 -d postgres -c "set client_min_messages = warning" -c "drop database if exists $DB" -c "create database $DB"
  psql -q -v ON_ERROR_STOP=1 -d $DB -f tests/shim.sql
  local m
  for m in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d $DB -f "$m"; done
  psql -q -v ON_ERROR_STOP=1 -d $DB -f tests/helpers.sql
}

for f in tests/*.test.sql; do
  echo "== $f"
  fresh_db
  psql -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | sed -n -e 's/^.*NOTICE:  //p' -e '/ERROR/p'
done
echo "All database tests passed."
