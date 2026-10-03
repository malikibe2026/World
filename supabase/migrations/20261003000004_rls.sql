-- WorldStat Atlas · 0004 · Row Level Security
-- Reference & statistics: public read. Writes: service role only (pipeline), which bypasses RLS.
-- Operational tables (downloads, import logs): no direct anon access.

do $$
declare t text;
begin
  foreach t in array array[
    'data_sources', 'dataset_versions', 'indicators', 'geographies', 'countries', 'admin_level_1', 'admin_level_2',
    'geometries', 'places', 'landmarks', 'population', 'vital_statistics', 'economic_statistics', 'tourism_statistics',
    'population_age_sex', 'historical_events', 'quality_issues'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;

  foreach t in array array['downloads', 'import_runs', 'import_log'] loop
    execute format('alter table public.%I enable row level security', t);
    -- no policies: only the service role (pipeline / dashboard) can read or write
  end loop;
end $$;

-- Least privilege on the API roles.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
revoke select on public.downloads, public.import_runs, public.import_log from anon, authenticated;
