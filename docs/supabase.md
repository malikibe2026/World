# Supabase (PostgreSQL + PostGIS)

## Skema

Migrasi: [`supabase/migrations`](../supabase/migrations)

| Jadual | Kandungan | FK |
|---|---|---|
| `data_sources` | Penerbit, URL, lesen, sitasi | — |
| `dataset_versions` | Versi/fail sumber, masa ambil, checksum, `last_updated` | `data_sources` |
| `indicators` | Kod, nama BM/EN, unit, kualiti lalai, kod WB, formula | `data_sources` |
| `geographies` | Semua unit (dunia → daerah) dengan `parent_id`, titik label, bbox, keluasan | diri sendiri, `data_sources` |
| `countries`, `admin_level_1`, `admin_level_2` | Atribut khusus tahap | `geographies` |
| `geometries` | `geometry(MultiPolygon, 4326)` + `geom_z3`/`geom_z6` pra-ringkas | `geographies`, `data_sources` |
| `places` | Bandar (NE) dengan negeri/daerah daripada sambungan spatial | `countries`, `admin_level_1/2` |
| `landmarks` | Mercu tanda Wikidata | `countries`, `data_sources` |
| `population`, `vital_statistics`, `economic_statistics`, `tourism_statistics` | Pemerhatian: geo, indikator, tahun, `reference_period`, nilai, `quality`, sumber, versi dataset | `geographies`, `indicators`, `data_sources`, `dataset_versions` |
| `population_age_sex` | Piramid | `geographies`, `data_sources` |
| `historical_events` | Garis masa | `geographies`, `data_sources` |
| `downloads` | Log muat turun (tanpa data peribadi) | `geographies` |
| `import_runs`, `import_log`, `quality_issues` | Log pipeline & kualiti | — |

Paparan `v_observations` menggabungkan semua jadual statistik dengan medan asal usul yang diperlukan
oleh eksport (`source_name`, `source_url`, `reference_period`, `last_updated`, `geographic_level`,
`unit`, `methodology_notes`).

## API (RPC)

| Fungsi | Guna |
|---|---|
| `get_series(geo, indicators[], from, to)` | Siri masa dengan asal usul |
| `get_layer(indicator, year, level, parent)` | Lapisan choropleth (agregasi pelayan) |
| `get_pyramid(geo, year, source)` | Piramid |
| `get_hierarchy(geo)` | Breadcrumb |
| `geo_at_point(lon, lat)` | Unit yang mengandungi titik (PostGIS `ST_Contains`) |
| `nearby_landmarks(lon, lat, km, category)` | Mercu tanda dalam radius (geodesik) |
| `search_geographies(q)` | Carian trigram + unaccent |
| `mvt_boundaries(z, x, y, level)` | Jubin vektor (MVT) mengikut zum |
| `log_download(...)` | Rekod muat turun (SECURITY DEFINER) |
| `refresh_atlas_views()` | Segar semula materialized views (service role sahaja) |

## RLS

- Jadual rujukan & statistik: **baca awam** (`anon`, `authenticated`); tiada tulis.
- `downloads`, `import_runs`, `import_log`: tiada akses langsung untuk `anon` (tulis melalui `log_download` sahaja).
- Penulisan hanya oleh **service role** (pipeline/pemuat), yang tidak pernah digunakan dalam pelayar.

## Langkah

```bash
supabase link --project-ref <ref>
supabase db push                                  # gunakan migrasi
python3 scripts/pipeline/run.py                   # jana data/exports/*.csv
export SUPABASE_DB_URL='postgresql://…'           # JANGAN commit
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/supabase/load_exports.sql
supabase functions deploy data-proxy --no-verify-jwt   # pilihan
```

Kemudian set dalam `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
(dan `VITE_DATA_PROXY_URL` jika proxy digunakan).

## Ujian tempatan (telah dilakukan)

Skema diuji pada PostgreSQL 16 + PostGIS 3.4 dengan [`supabase/tests/bootstrap_local.sql`](../supabase/tests/bootstrap_local.sql)
(peranan `anon`/`authenticated`/`service_role` tiruan): semua migrasi berjaya, ~2.6 juta baris dimuat
(`population` 426k, `vital_statistics` 582k, `population_age_sex` 1.63 juta, 5,006 geometri), dan:

- `get_hierarchy('MY-10-hulu-langat')` → WORLD › Asia › Malaysia › Selangor › Hulu Langat
- `geo_at_point(101.79, 2.99)` (Kajang) → Malaysia, Selangor, Hulu Langat
- `mvt_boundaries(3,6,3,'country')` → jubin 14 KB
- `anon` boleh membaca statistik, **tidak** boleh menulis atau membaca `downloads`.
