-- WorldStat Atlas · 0001 · extensions
-- PostGIS for geometry & spatial queries; pg_trgm + unaccent for smart search.
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
