-- WorldStat Atlas · 0005 · materialized views for fast panels and rankings
-- Refresh after each pipeline load:  select public.refresh_atlas_views();

-- Latest non-projected value per geography × indicator (location panel, rankings).
create materialized view if not exists public.mv_latest_observation as
select distinct on (geo_id, indicator)
  geo_id, location, geographic_level, country_id, indicator, indicator_name, value, unit, year,
  reference_period, quality, source_name, source_url, last_updated
from public.v_observations
where quality <> 'PROJECTION' and value is not null
order by geo_id, indicator, year desc;
create unique index if not exists mv_latest_obs_uidx on public.mv_latest_observation (geo_id, indicator);
create index if not exists mv_latest_obs_ind_idx on public.mv_latest_observation (indicator, value desc);

-- Country ranking per indicator and year (time machine / ranking charts).
create materialized view if not exists public.mv_country_rank as
select o.indicator, o.year, o.geo_id, o.value, o.quality,
       rank() over (partition by o.indicator, o.year order by o.value desc nulls last) as rank_desc,
       count(*) over (partition by o.indicator, o.year) as n
from public.v_observations o
where o.geographic_level = 'country' and o.value is not null;
create unique index if not exists mv_country_rank_uidx on public.mv_country_rank (indicator, year, geo_id);

create or replace function public.refresh_atlas_views() returns void
language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently public.mv_latest_observation;
  refresh materialized view concurrently public.mv_country_rank;
end;
$$;
revoke all on function public.refresh_atlas_views() from public, anon, authenticated;

grant select on public.mv_latest_observation, public.mv_country_rank to anon, authenticated;
