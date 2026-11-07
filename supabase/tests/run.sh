#!/usr/bin/env bash
# Applies the shim + all migrations to a fresh database and runs the SQL tests.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=bank_of_dad_test
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d $DB -f tests/shim.sql
for f in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d $DB -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d $DB -f tests/helpers.sql
for f in tests/*.test.sql; do
  echo "== $f"
  psql -q -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | sed -n -e 's/^.*NOTICE:  //p' -e '/ERROR/p'
done
echo "All database tests passed."
