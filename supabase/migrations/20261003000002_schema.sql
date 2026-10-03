-- WorldStat Atlas · 0002 · core schema
-- Every statistical row has a foreign key to a geography AND to a data source (and a dataset
-- version), a reference period, a unit (through its indicator) and a quality class.

-- ---------------------------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------------------------
do $$ begin
  create type public.data_quality as enum ('OFFICIAL', 'ESTIMATE', 'PROJECTION', 'DERIVED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.geo_level as enum ('world', 'continent', 'subregion', 'country', 'admin1', 'admin2', 'place');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------------------------
-- Provenance
-- ---------------------------------------------------------------------------------------------
create table if not exists public.data_sources (
  id              text primary key,
  name            text not null,
  publisher       text not null,
  url             text not null,
  license         text,
  citation        text,
  access          text check (access in ('snapshot', 'live', 'pipeline')),
  default_quality public.data_quality,
  notes           text,
  created_at      timestamptz not null default now()
);
comment on table public.data_sources is 'Authoritative publishers (UN DESA, World Bank, DOSM, Natural Earth …).';

create table if not exists public.dataset_versions (
  id            bigint generated always as identity primary key,
  source_id     text not null references public.data_sources(id),
  dataset       text not null,                 -- e.g. 'wpp2024/popAge1dt', 'opendosm/population_state'
  version       text,                          -- publisher version / release label
  source_url    text,
  retrieved_at  timestamptz not null,
  last_updated  timestamptz,                   -- publisher's last-updated stamp
  sha256        text,
  row_count     bigint,
  license       text,
  notes         text,
  unique (source_id, dataset, retrieved_at)
);

create table if not exists public.indicators (
  code            text primary key,
  category        text not null,
  name_en         text not null,
  name_ms         text not null,
  unit            text not null,
  source_id       text not null references public.data_sources(id),
  default_quality public.data_quality not null,
  wb_code         text,
  original_source text,
  formula         text,                         -- for DERIVED indicators
  notes           text
);

-- ---------------------------------------------------------------------------------------------
-- Geography (one row per unit at every level; typed tables hold level-specific attributes)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.geographies (
  id          text primary key,                -- 'WORLD', 'UN_935', 'MYS', 'MY-10', 'MY-10-hulu-langat'
  level       public.geo_level not null,
  parent_id   text references public.geographies(id),
  country_id  text,                            -- denormalised for fast filtering
  name        text not null,
  name_local  text,
  label_point extensions.geometry(Point, 4326),
  bbox        extensions.geometry(Polygon, 4326),
  area_km2    numeric,                         -- geodesic area of the boundary (DERIVED)
  source_id   text references public.data_sources(id),
  created_at  timestamptz not null default now()
);
create index if not exists geographies_parent_idx on public.geographies (parent_id);
create index if not exists geographies_level_idx on public.geographies (level);
create index if not exists geographies_country_idx on public.geographies (country_id);
create index if not exists geographies_label_gix on public.geographies using gist (label_point);
create index if not exists geographies_name_trgm on public.geographies using gin (name extensions.gin_trgm_ops);

create table if not exists public.countries (
  id            text primary key references public.geographies(id) on delete cascade,
  iso2          text,
  iso3          text,
  m49           integer,
  wb_code       text,
  name_official text,
  type          text,
  continent_id  text references public.geographies(id),
  subregion     text,
  capital       text,
  wikidata      text
);
create unique index if not exists countries_iso3_uidx on public.countries (iso3) where iso3 is not null;

create table if not exists public.admin_level_1 (
  id          text primary key references public.geographies(id) on delete cascade,
  country_id  text not null references public.countries(id),
  type        text,
  iso_3166_2  text,
  wikidata    text
);
create index if not exists admin1_country_idx on public.admin_level_1 (country_id);

create table if not exists public.admin_level_2 (
  id           text primary key references public.geographies(id) on delete cascade,
  admin1_id    text not null references public.admin_level_1(id),
  country_id   text not null references public.countries(id),
  type         text,
  name_source  text                            -- name as spelled in the boundary source
);
create index if not exists admin2_admin1_idx on public.admin_level_2 (admin1_id);

create table if not exists public.geometries (
  id           bigint generated always as identity primary key,
  geo_id       text not null references public.geographies(id) on delete cascade,
  source_id    text not null references public.data_sources(id),
  resolution   text not null,                  -- '10m', 'simplified', …
  geom         extensions.geometry(MultiPolygon, 4326) not null,
  -- pre-simplified copies for low zoom levels (vector tiles); tolerance in degrees
  geom_z3      extensions.geometry(MultiPolygon, 4326) generated always as (extensions.st_multi(extensions.st_simplifypreservetopology(geom, 0.05))) stored,
  geom_z6      extensions.geometry(MultiPolygon, 4326) generated always as (extensions.st_multi(extensions.st_simplifypreservetopology(geom, 0.005))) stored,
  unique (geo_id, resolution)
);
create index if not exists geometries_geom_gix on public.geometries using gist (geom);
create index if not exists geometries_geom_z3_gix on public.geometries using gist (geom_z3);
create index if not exists geometries_geom_z6_gix on public.geometries using gist (geom_z6);

create table if not exists public.places (
  id            bigint generated always as identity primary key,
  name          text not null,
  country_id    text references public.countries(id),
  admin1_id     text references public.admin_level_1(id),
  admin2_id     text references public.admin_level_2(id),
  admin1_name   text,
  kind          text,                          -- capital, admin1_capital, place, town …
  scalerank     integer,
  pop_estimate  bigint,                        -- compiled estimate (Natural Earth); not an official statistic
  geom          extensions.geometry(Point, 4326) not null,
  source_id     text not null references public.data_sources(id)
);
create index if not exists places_geom_gix on public.places using gist (geom);
create index if not exists places_country_idx on public.places (country_id);
create index if not exists places_name_trgm on public.places using gin (name extensions.gin_trgm_ops);

create table if not exists public.landmarks (
  id            text primary key,              -- Wikidata QID
  name          text not null,
  description   text,
  categories    text[] not null default '{}',
  country_id    text references public.countries(id),
  geom          extensions.geometry(Point, 4326) not null,
  sitelinks     integer,
  image_file    text,                          -- Wikimedia Commons file name (licence per file)
  inception     text,
  wikipedia_url text,
  source_id     text not null references public.data_sources(id),
  retrieved_at  timestamptz
);
create index if not exists landmarks_geom_gix on public.landmarks using gist (geom);
create index if not exists landmarks_country_idx on public.landmarks (country_id);

-- ---------------------------------------------------------------------------------------------
-- Statistics. All tables share the same observation columns.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.population (
  id                 bigint generated always as identity primary key,
  geo_id             text not null references public.geographies(id),
  indicator_code     text not null references public.indicators(code),
  year               integer not null,
  reference_period   text not null,            -- '2024-01-01', 'mid-year 2024', '2023'
  value              double precision,
  quality            public.data_quality not null,
  source_id          text not null references public.data_sources(id),
  dataset_version_id bigint references public.dataset_versions(id),
  notes              text,
  unique (geo_id, indicator_code, year, source_id)
);

create table if not exists public.vital_statistics (like public.population including all);
alter table public.vital_statistics add foreign key (geo_id) references public.geographies(id);
alter table public.vital_statistics add foreign key (indicator_code) references public.indicators(code);
alter table public.vital_statistics add foreign key (source_id) references public.data_sources(id);
alter table public.vital_statistics add foreign key (dataset_version_id) references public.dataset_versions(id);

create table if not exists public.economic_statistics (like public.population including all);
alter table public.economic_statistics add foreign key (geo_id) references public.geographies(id);
alter table public.economic_statistics add foreign key (indicator_code) references public.indicators(code);
alter table public.economic_statistics add foreign key (source_id) references public.data_sources(id);
alter table public.economic_statistics add foreign key (dataset_version_id) references public.dataset_versions(id);

create table if not exists public.tourism_statistics (like public.population including all);
alter table public.tourism_statistics add foreign key (geo_id) references public.geographies(id);
alter table public.tourism_statistics add foreign key (indicator_code) references public.indicators(code);
alter table public.tourism_statistics add foreign key (source_id) references public.data_sources(id);
alter table public.tourism_statistics add foreign key (dataset_version_id) references public.dataset_versions(id);

create table if not exists public.population_age_sex (
  id                 bigint generated always as identity primary key,
  geo_id             text not null references public.geographies(id),
  year               integer not null,
  age_group          text not null,            -- '0-4' … '100+' (UN) / '85+' (DOSM)
  sex                text not null check (sex in ('male', 'female')),
  value              double precision,
  quality            public.data_quality not null,
  source_id          text not null references public.data_sources(id),
  dataset_version_id bigint references public.dataset_versions(id),
  unique (geo_id, year, age_group, sex, source_id)
);

do $$
declare t text;
begin
  foreach t in array array['population', 'vital_statistics', 'economic_statistics', 'tourism_statistics'] loop
    execute format('create index if not exists %1$s_geo_ind_year_idx on public.%1$s (geo_id, indicator_code, year)', t);
    execute format('create index if not exists %1$s_ind_year_idx on public.%1$s (indicator_code, year)', t);
  end loop;
end $$;
create index if not exists pas_geo_year_idx on public.population_age_sex (geo_id, year);

create table if not exists public.historical_events (
  id               text primary key,
  geo_id           text not null references public.geographies(id),
  era              text,
  year             integer not null,
  date             date,
  precision        text check (precision in ('day', 'year', 'circa', 'century')),
  title_en         text not null,
  title_ms         text,
  summary_en       text,
  summary_ms       text,
  contested        boolean not null default false,
  interpretations  jsonb not null default '[]',
  refs             jsonb not null default '[]',
  geom             extensions.geometry(Point, 4326),
  source_id        text not null references public.data_sources(id)
);
create index if not exists historical_events_geo_year_idx on public.historical_events (geo_id, year);

-- ---------------------------------------------------------------------------------------------
-- Operations: downloads, pipeline runs, quality issues
-- ---------------------------------------------------------------------------------------------
create table if not exists public.downloads (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  geo_id      text references public.geographies(id),
  format      text not null check (format in ('csv', 'xlsx', 'json', 'geojson', 'png', 'pdf')),
  indicators  text[] not null default '{}',
  row_count   integer,
  client      text                              -- coarse user agent family only; no personal data
);

create table if not exists public.import_runs (
  run_id       text primary key,
  started_at   timestamptz,
  finished_at  timestamptz,
  status       text,
  counts       jsonb,
  steps        jsonb
);

create table if not exists public.import_log (
  id        bigint generated always as identity primary key,
  run_id    text references public.import_runs(run_id) on delete cascade,
  ts        timestamptz not null,
  step      text not null,
  level     text not null check (level in ('info', 'warning', 'error')),
  message   text not null,
  context   jsonb
);
create index if not exists import_log_run_idx on public.import_log (run_id, level);

create table if not exists public.quality_issues (
  id         bigint generated always as identity primary key,
  run_id     text references public.import_runs(run_id) on delete cascade,
  check_name text not null check (check_name in ('missing_values', 'duplicate_records', 'outliers', 'year_mismatch', 'geographic_mismatch', 'unit_mismatch')),
  severity   text not null check (severity in ('info', 'warning', 'error')),
  geo_id     text,
  indicator  text,
  year       integer,
  value      text,
  message    text not null
);
create index if not exists quality_issues_geo_idx on public.quality_issues (geo_id);

-- ---------------------------------------------------------------------------------------------
-- Unified, self-describing observation view: every row carries the provenance fields required
-- for exports (source_name, source_url, reference_period, last_updated, geographic_level, unit,
-- methodology/notes).
-- ---------------------------------------------------------------------------------------------
create or replace view public.v_observations with (security_invoker = true) as
with obs as (
  select 'population'::text as table_name, * from public.population
  union all select 'vital_statistics', * from public.vital_statistics
  union all select 'economic_statistics', * from public.economic_statistics
  union all select 'tourism_statistics', * from public.tourism_statistics
)
select
  o.geo_id,
  g.name                  as location,
  g.level                 as geographic_level,
  g.country_id,
  o.indicator_code        as indicator,
  i.name_en               as indicator_name,
  o.value,
  i.unit,
  o.year,
  o.reference_period,
  o.quality,
  s.name                  as source_name,
  s.publisher             as source_publisher,
  coalesce(dv.source_url, s.url) as source_url,
  coalesce(dv.last_updated, dv.retrieved_at) as last_updated,
  coalesce(i.formula, i.notes, o.notes) as methodology_notes,
  o.table_name
from obs o
join public.geographies g on g.id = o.geo_id
join public.indicators i  on i.code = o.indicator_code
join public.data_sources s on s.id = o.source_id
left join public.dataset_versions dv on dv.id = o.dataset_version_id;
