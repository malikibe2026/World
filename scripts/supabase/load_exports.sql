-- Load the pipeline exports (data/exports/*.csv) into Supabase.
--
--   export SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'   # never commit this
--   python3 scripts/pipeline/run.py                     # produces data/exports
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/supabase/load_exports.sql
--
-- Runs from the repository root (paths are relative). Idempotent: upserts on natural keys.
\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;

-- 1. provenance ---------------------------------------------------------------------------------
create temp table s_sources (id text, name text, publisher text, url text, license text, citation text, access text, default_quality text, notes text) on commit drop;
\copy s_sources from 'data/exports/data_sources.csv' csv header
insert into data_sources (id, name, publisher, url, license, citation, access, default_quality, notes)
select id, name, publisher, url, nullif(license, ''), nullif(citation, ''), nullif(access, ''), nullif(default_quality, '')::data_quality, nullif(notes, '') from s_sources
on conflict (id) do update set name = excluded.name, publisher = excluded.publisher, url = excluded.url, license = excluded.license,
  citation = excluded.citation, access = excluded.access, default_quality = excluded.default_quality, notes = excluded.notes;

create temp table s_versions (source_id text, dataset text, version text, source_url text, retrieved_at timestamptz, last_updated text, sha256 text) on commit drop;
\copy s_versions from 'data/exports/dataset_versions.csv' csv header
insert into dataset_versions (source_id, dataset, version, source_url, retrieved_at, last_updated, sha256)
select source_id, dataset, nullif(version, ''), nullif(source_url, ''), retrieved_at, nullif(last_updated, '')::timestamptz, nullif(sha256, '') from s_versions
on conflict (source_id, dataset, retrieved_at) do nothing;

create temp table s_ind (code text, category text, name_en text, name_ms text, unit text, source_id text, default_quality text, wb_code text, original_source text, formula text, notes text) on commit drop;
\copy s_ind from 'data/exports/indicators.csv' csv header
insert into indicators select code, category, name_en, name_ms, unit, source_id, default_quality::data_quality, nullif(wb_code, ''), nullif(original_source, ''), nullif(formula, ''), nullif(notes, '') from s_ind
on conflict (code) do update set category = excluded.category, name_en = excluded.name_en, name_ms = excluded.name_ms, unit = excluded.unit,
  source_id = excluded.source_id, default_quality = excluded.default_quality, wb_code = excluded.wb_code, original_source = excluded.original_source,
  formula = excluded.formula, notes = excluded.notes;

-- 2. geography ----------------------------------------------------------------------------------
create temp table s_geo (id text, level text, parent_id text, country_id text, name text, name_local text, lon float8, lat float8,
  minx float8, miny float8, maxx float8, maxy float8, area_km2 numeric, source_id text) on commit drop;
\copy s_geo from 'data/exports/geographies.csv' csv header
-- parents first: insert without parent, then set parent (keeps the FK satisfied in one pass)
insert into geographies (id, level, country_id, name, name_local, label_point, bbox, area_km2, source_id)
select id, level::geo_level, nullif(country_id, ''), name, nullif(name_local, ''),
       case when lon is not null then st_setsrid(st_makepoint(lon, lat), 4326) end,
       case when minx is not null then st_makeenvelope(minx, miny, maxx, maxy, 4326) end,
       area_km2, nullif(source_id, '')
from s_geo
on conflict (id) do update set level = excluded.level, country_id = excluded.country_id, name = excluded.name, name_local = excluded.name_local,
  label_point = excluded.label_point, bbox = excluded.bbox, area_km2 = excluded.area_km2, source_id = excluded.source_id;
update geographies g set parent_id = s.parent_id from s_geo s where s.id = g.id and nullif(s.parent_id, '') is not null
  and exists (select 1 from geographies p where p.id = s.parent_id);

create temp table s_c (id text, iso2 text, iso3 text, m49 int, wb_code text, name text, name_official text, type text, continent_id text, subregion text, capital text, wikidata text, label_lon float8, label_lat float8) on commit drop;
\copy s_c from 'data/exports/countries.csv' csv header
insert into countries (id, iso2, iso3, m49, wb_code, name_official, type, continent_id, subregion, capital, wikidata)
select id, nullif(iso2, ''), nullif(iso3, ''), m49, nullif(wb_code, ''), name_official, type, nullif(continent_id, ''), subregion, nullif(capital, ''), nullif(wikidata, '') from s_c
on conflict (id) do update set iso2 = excluded.iso2, iso3 = excluded.iso3, m49 = excluded.m49, wb_code = excluded.wb_code, name_official = excluded.name_official,
  type = excluded.type, continent_id = excluded.continent_id, subregion = excluded.subregion, capital = excluded.capital, wikidata = excluded.wikidata;

create temp table s_a1 (id text, country_id text, name text, name_local text, type text, iso_3166_2 text, wikidata text, area_km2 numeric, label_lon float8, label_lat float8) on commit drop;
\copy s_a1 from 'data/exports/admin_level_1.csv' csv header
insert into admin_level_1 (id, country_id, type, iso_3166_2, wikidata)
select id, country_id, nullif(type, ''), nullif(iso_3166_2, ''), nullif(wikidata, '') from s_a1 where country_id in (select id from countries)
on conflict (id) do update set country_id = excluded.country_id, type = excluded.type, iso_3166_2 = excluded.iso_3166_2, wikidata = excluded.wikidata;

create temp table s_a2 (id text, admin1_id text, country_id text, name text, name_source text, type text, area_km2 numeric, label_lon float8, label_lat float8) on commit drop;
\copy s_a2 from 'data/exports/admin_level_2.csv' csv header
insert into admin_level_2 (id, admin1_id, country_id, type, name_source)
select id, admin1_id, country_id, type, name_source from s_a2
on conflict (id) do update set admin1_id = excluded.admin1_id, type = excluded.type, name_source = excluded.name_source;

create temp table s_geom (level text, geo_id text, source_id text, resolution text, geojson text) on commit drop;
\copy s_geom from 'data/exports/geometries.csv' csv header
insert into geometries (geo_id, source_id, resolution, geom)
select geo_id, source_id, resolution, st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson(geojson), 4326)), 3))
from s_geom where geo_id in (select id from geographies)
on conflict (geo_id, resolution) do update set geom = excluded.geom, source_id = excluded.source_id;

create temp table s_pl (name text, country_id text, admin1_name text, kind text, scalerank int, pop_estimate float8, lon float8, lat float8, source_id text) on commit drop;
\copy s_pl from 'data/exports/places.csv' csv header
delete from places where source_id = 'natural_earth';
insert into places (name, country_id, admin1_name, kind, scalerank, pop_estimate, geom, source_id)
select name, case when country_id in (select id from countries) then country_id end, nullif(admin1_name, ''), kind, scalerank,
       pop_estimate::bigint, st_setsrid(st_makepoint(lon, lat), 4326), source_id from s_pl;
-- spatial join: attach admin-1 / admin-2 using PostGIS
update places p set admin1_id = g.geo_id from geometries g join geographies gg on gg.id = g.geo_id
 where gg.level = 'admin1' and p.admin1_id is null and st_contains(g.geom, p.geom) and g.geo_id in (select id from admin_level_1);
update places p set admin2_id = g.geo_id from geometries g join geographies gg on gg.id = g.geo_id
 where gg.level = 'admin2' and st_contains(g.geom, p.geom);

-- 3. statistics -----------------------------------------------------------------------------------
create temp table s_obs (geo_id text, indicator_code text, year int, reference_period text, value float8, quality text, source_id text) on commit drop;
\copy s_obs from 'data/exports/population.csv' csv header
insert into population (geo_id, indicator_code, year, reference_period, value, quality, source_id, dataset_version_id)
select o.geo_id, o.indicator_code, o.year, o.reference_period, o.value, o.quality::data_quality, o.source_id,
       (select max(id) from dataset_versions v where v.source_id = o.source_id)
from s_obs o where o.geo_id in (select id from geographies)
on conflict (geo_id, indicator_code, year, source_id) do update set value = excluded.value, quality = excluded.quality,
  reference_period = excluded.reference_period, dataset_version_id = excluded.dataset_version_id;
truncate s_obs;
\copy s_obs from 'data/exports/vital_statistics.csv' csv header
insert into vital_statistics (geo_id, indicator_code, year, reference_period, value, quality, source_id, dataset_version_id)
select o.geo_id, o.indicator_code, o.year, o.reference_period, o.value, o.quality::data_quality, o.source_id,
       (select max(id) from dataset_versions v where v.source_id = o.source_id)
from s_obs o where o.geo_id in (select id from geographies)
on conflict (geo_id, indicator_code, year, source_id) do update set value = excluded.value, quality = excluded.quality,
  reference_period = excluded.reference_period, dataset_version_id = excluded.dataset_version_id;

create temp table s_pas (geo_id text, year int, age_group text, sex text, value float8, quality text, source_id text) on commit drop;
\copy s_pas from 'data/exports/population_age_sex.csv' csv header
insert into population_age_sex (geo_id, year, age_group, sex, value, quality, source_id, dataset_version_id)
select o.geo_id, o.year, o.age_group, o.sex, o.value, o.quality::data_quality, o.source_id,
       (select max(id) from dataset_versions v where v.source_id = o.source_id)
from s_pas o where o.geo_id in (select id from geographies)
on conflict (geo_id, year, age_group, sex, source_id) do update set value = excluded.value, quality = excluded.quality;

create temp table s_hist (id text, geo_id text, era text, year int, date text, precision text, title_en text, title_ms text, summary_en text, summary_ms text,
  contested boolean, interpretations text, refs text, lon float8, lat float8, source_id text) on commit drop;
\copy s_hist from 'data/exports/historical_events.csv' csv header
insert into historical_events (id, geo_id, era, year, date, precision, title_en, title_ms, summary_en, summary_ms, contested, interpretations, refs, geom, source_id)
select id, geo_id, era, year, nullif(date, '')::date, precision, title_en, title_ms, summary_en, summary_ms, contested, interpretations::jsonb, refs::jsonb,
       case when lon is not null then st_setsrid(st_makepoint(lon, lat), 4326) end, source_id from s_hist
on conflict (id) do update set era = excluded.era, year = excluded.year, date = excluded.date, title_en = excluded.title_en, title_ms = excluded.title_ms,
  summary_en = excluded.summary_en, summary_ms = excluded.summary_ms, contested = excluded.contested, interpretations = excluded.interpretations,
  refs = excluded.refs, geom = excluded.geom;

commit;

-- 4. derived views ------------------------------------------------------------------------------
-- (concurrent refresh needs the unique indexes created in migration 0005; first load uses a plain refresh)
refresh materialized view public.mv_latest_observation;
refresh materialized view public.mv_country_rank;
analyze;
