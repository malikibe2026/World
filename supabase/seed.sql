-- Local seed: intentionally empty of statistics.
-- Load the real snapshot with:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/supabase/load_exports.sql
-- (statistics must come from the pipeline so that provenance is recorded, never hand-typed here).
select 1;
