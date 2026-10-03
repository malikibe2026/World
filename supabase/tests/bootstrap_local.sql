-- Emulates the parts of a Supabase database the migrations rely on, for testing on plain PostgreSQL+PostGIS.
create schema if not exists extensions;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public, extensions to anon, authenticated, service_role;
