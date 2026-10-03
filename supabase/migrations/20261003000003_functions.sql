-- WorldStat Atlas · 0003 · API functions (PostgREST RPC) and vector tiles
-- All read functions are STABLE so PostgREST can serve them with GET (cacheable).

-- Time series for one geography (paged by indicator list), self-describing rows.
create or replace function public.get_series(
  p_geo_id text,
  p_indicators text[] default null,
  p_year_from int default 1950,
  p_year_to int default 2100
) returns setof public.v_observations
language sql stable security invoker set search_path = public as $$
  select * from public.v_observations
  where geo_id = p_geo_id
    and (p_indicators is null or indicator = any (p_indicators))
    and year between p_year_from and p_year_to
  order by indicator, year;
$$;

-- One indicator for all units of a level and one year → choropleth layer (server-side aggregation).
create or replace function public.get_layer(
  p_indicator text,
  p_year int,
  p_level public.geo_level default 'country',
  p_parent text default null
) returns table (geo_id text, value double precision, quality public.data_quality, year int, source_id text)
language sql stable security invoker set search_path = public as $$
  with o as (
    select geo_id, value, quality, year, source_id from public.population where indicator_code = p_indicator and year = p_year
    union all select geo_id, value, quality, year, source_id from public.vital_statistics where indicator_code = p_indicator and year = p_year
    union all select geo_id, value, quality, year, source_id from public.economic_statistics where indicator_code = p_indicator and year = p_year
    union all select geo_id, value, quality, year, source_id from public.tourism_statistics where indicator_code = p_indicator and year = p_year
  )
  select o.geo_id, o.value, o.quality, o.year, o.source_id
  from o join public.geographies g on g.id = o.geo_id
  where g.level = p_level and (p_parent is null or g.parent_id = p_parent);
$$;

-- Population pyramid.
create or replace function public.get_pyramid(p_geo_id text, p_year int, p_source text default null)
returns setof public.population_age_sex
language sql stable security invoker set search_path = public as $$
  select * from public.population_age_sex
  where geo_id = p_geo_id and year = p_year and (p_source is null or source_id = p_source)
  order by source_id, sex, (regexp_replace(age_group, '[^0-9].*$', ''))::int;
$$;

-- Hierarchy (breadcrumb) for a geography: WORLD → continent → country → admin1 → admin2.
create or replace function public.get_hierarchy(p_geo_id text)
returns table (depth int, id text, level public.geo_level, name text)
language sql stable security invoker set search_path = public as $$
  with recursive up as (
    select 0 as depth, g.id, g.level, g.name, g.parent_id from public.geographies g where g.id = p_geo_id
    union all
    select up.depth + 1, g.id, g.level, g.name, g.parent_id from public.geographies g join up on g.id = up.parent_id
  )
  select depth, id, level, name from up order by depth desc;
$$;

-- Spatial query: which units contain this point (reverse geocoding by PostGIS).
create or replace function public.geo_at_point(p_lon double precision, p_lat double precision)
returns table (id text, level public.geo_level, name text)
language sql stable security invoker set search_path = public, extensions as $$
  select g.id, g.level, g.name
  from public.geometries ge join public.geographies g on g.id = ge.geo_id
  where ge.geom && st_setsrid(st_makepoint(p_lon, p_lat), 4326)
    and st_contains(ge.geom, st_setsrid(st_makepoint(p_lon, p_lat), 4326))
  order by g.level;
$$;

-- Landmarks near a point (geodesic distance), optionally filtered by category.
create or replace function public.nearby_landmarks(p_lon double precision, p_lat double precision, p_radius_km double precision default 50, p_category text default null, p_limit int default 50)
returns table (id text, name text, categories text[], lon double precision, lat double precision, distance_km double precision, sitelinks int)
language sql stable security invoker set search_path = public, extensions as $$
  select l.id, l.name, l.categories, st_x(l.geom), st_y(l.geom),
         st_distance(l.geom::geography, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography) / 1000.0,
         l.sitelinks
  from public.landmarks l
  where st_dwithin(l.geom::geography, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, p_radius_km * 1000)
    and (p_category is null or p_category = any (l.categories))
  order by l.sitelinks desc nulls last
  limit least(p_limit, 500);
$$;

-- Smart search across geographies and places (trigram similarity, accent-insensitive).
create or replace function public.search_geographies(p_query text, p_limit int default 20)
returns table (kind text, id text, name text, level text, country_id text, lon double precision, lat double precision, score real)
language sql stable security invoker set search_path = public, extensions as $$
  with q as (select lower(unaccent(p_query)) as q)
  (select 'geography', g.id, g.name, g.level::text, g.country_id, st_x(g.label_point), st_y(g.label_point),
          similarity(lower(unaccent(g.name)), q.q) as score
   from public.geographies g, q
   where lower(unaccent(g.name)) % q.q or lower(unaccent(g.name)) like q.q || '%')
  union all
  (select 'place', p.id::text, p.name, 'place', p.country_id, st_x(p.geom), st_y(p.geom),
          similarity(lower(unaccent(p.name)), q.q) * 0.9
   from public.places p, q
   where lower(unaccent(p.name)) % q.q)
  order by score desc
  limit least(p_limit, 100);
$$;

-- Mapbox Vector Tile of boundaries for z/x/y, simplified by zoom (served by PostgREST as bytea:
-- GET /rest/v1/rpc/mvt_boundaries?z=..&x=..&y=..&p_level=country with Accept: application/octet-stream).
create or replace function public.mvt_boundaries(z int, x int, y int, p_level public.geo_level default 'country')
returns bytea
language sql stable parallel safe security invoker set search_path = public, extensions as $$
  with bounds as (select st_tileenvelope(z, x, y) as env, st_transform(st_tileenvelope(z, x, y), 4326) as env4326),
  feats as (
    select g.id, g.name, g.level::text as level, g.country_id,
           st_asmvtgeom(
             st_transform(case when z < 4 then ge.geom_z3 when z < 8 then ge.geom_z6 else ge.geom end, 3857),
             bounds.env, 4096, 64, true) as geom
    from public.geometries ge
    join public.geographies g on g.id = ge.geo_id, bounds
    where g.level = p_level
      and (case when z < 4 then ge.geom_z3 when z < 8 then ge.geom_z6 else ge.geom end) && bounds.env4326
  )
  select st_asmvt(feats.*, 'boundaries', 4096, 'geom') from feats where geom is not null;  -- text ids stay a property (promoteId: 'id' in MapLibre)
$$;

-- Record a download (no personal data). SECURITY DEFINER so anon can insert only through here.
create or replace function public.log_download(p_geo_id text, p_format text, p_indicators text[], p_row_count int, p_client text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_format not in ('csv', 'xlsx', 'json', 'geojson', 'png', 'pdf') then
    raise exception 'unsupported format %', p_format;
  end if;
  insert into public.downloads (geo_id, format, indicators, row_count, client)
  values (
    case when exists (select 1 from public.geographies where id = p_geo_id) then p_geo_id end,
    p_format, coalesce(p_indicators[1:50], '{}'), least(greatest(p_row_count, 0), 10000000), left(p_client, 40)
  );
end;
$$;
revoke all on function public.log_download(text, text, text[], int, text) from public;
grant execute on function public.log_download(text, text, text[], int, text) to anon, authenticated;
