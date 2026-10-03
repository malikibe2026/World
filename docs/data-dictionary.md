# Kamus data

Sumber kebenaran: [`data/registry/indicators.json`](../data/registry/indicators.json) (juga boleh
dilihat dalam aplikasi: **Sumber → Kamus indikator**).

## Medan wajib setiap rekod statistik

| Medan | Maksud |
|---|---|
| `location` / `location_id` | Nama dan ID geografi (lihat *Pengecaman geografi* dalam `architecture.md`) |
| `geographic_level` | `world`, `continent`, `subregion`, `country`, `admin1`, `admin2` |
| `indicator` / `indicator_code` | Nama (BM/EN) dan kod indikator |
| `value` | Nilai; kosong jika tiada (tidak pernah diimputasi) |
| `unit` | Unit indikator (cth. `persons`, `per 1,000 population`, `current US$`) |
| `reference_year` / `reference_period` | Tahun dan tempoh rujukan (`2024-01-01`, `mid-year 2024`, `2023`) |
| `quality` | `OFFICIAL`, `ESTIMATE`, `PROJECTION`, `DERIVED` |
| `source` / `source_url` | Penerbit — set data; URL siri atau katalog |
| `last_updated` | Tarikh kemas kini penerbit (atau tarikh snapshot jika tiada) |
| `methodology_notes` | Formula (DERIVED), nota, penyusun asal (WDI) |

## Kelas kualiti

| Kelas | Takrif |
|---|---|
| **OFFICIAL** | Statistik rasmi yang diterbitkan (akaun negara, data pendaftaran, banci, survei rasmi). |
| **ESTIMATE** | Anggaran rasmi/bermodel (UN WPP 1950–2023, anggaran antara banci DOSM, anggaran bermodel ILO). |
| **PROJECTION** | Unjuran rasmi (UN WPP 2024 varian sederhana). Dipaparkan garis putus-putus. |
| **DERIVED** | Dikira oleh WorldStat daripada input rasmi; formula disimpan dalam registri. |

## Konvensyen masa

- **Stok penduduk (UN WPP)**: pakej R `wpp2024` merekod stok pada 31 Dis tahun *t*; WorldStat melabelkannya
  sebagai **1 Januari tahun t+1** (konvensyen rasmi UN). Tiada interpolasi. Anggaran hingga 1 Jan 2024.
- **Aliran & kadar (UN WPP)**: tahun kalendar *t*. Anggaran hingga 2023; 2024+ unjuran.
- **DOSM**: anggaran penduduk pertengahan tahun; tahun banci (1970, 1980, 1991, 2000, 2010, 2020) = OFFICIAL.
- **World Bank**: tahun siri; `last_updated` daripada pengepala API.

## Indikator terbitan (DERIVED)

| Kod | Formula |
|---|---|
| `sex_ratio` | `population_male / population_female × 100` |
| `median_age` | Median taburan umur tahun tunggal (0–100+), interpolasi linear |
| `pop_0_14`, `pop_15_64`, `pop_65_plus` | Jumlah umur tahun tunggal |
| `pop_*_pct` | Bahagian daripada jumlah penduduk |
| `natural_increase` | `births − deaths` |
| `density` | `population / area_geometry_km2` (keluasan geodesik sempadan, termasuk perairan pedalaman) |
| `area_geometry_km2` | Keluasan geodesik WGS84 poligon (pyproj) |
| `trade_balance` | `exports − imports` (tahun sama sahaja) |
| Struktur ekonomi “industri lain”, “cukai bersih/tidak diagih” | Baki: `industry − manufacturing`, `100 − (agri + industry + services)` |

## Fail snapshot (`public/data`)

| Laluan | Kandungan |
|---|---|
| `manifest.json` | Versi dataset, checksum SHA-256, status mod (snapshot/langsung) |
| `meta/sources.json`, `meta/indicators.json` | Registri sumber dan indikator |
| `meta/countries.json`, `meta/regions.json`, `meta/areas.json` | Indeks negara (bbox, label, kod), rantau UN M49, keluasan |
| `geo/world-{110m,50m,10m}.topo.json` | Sempadan negara |
| `geo/admin1/{ID}.topo.json`, `geo/admin2/MYS.topo.json` | Negeri/wilayah per negara; daerah Malaysia |
| `geo/places`, `geo/physical`, `geo/infra` | Bandar, puncak, rantau fizikal, laut, sungai, tasik, lapangan terbang, pelabuhan, jalan, kawasan bandar |
| `profiles/{ID}.json`, `profiles/admin/{ID}.json` | Profil geografi negara / negeri / daerah |
| `stats/wpp/{ID}.json` | Siri UN WPP 1950–2100 + piramid 5-tahun per tahun |
| `stats/layers/{code}.json` | Lapisan choropleth (semua negara × tahun) |
| `stats/my/*.json` | OpenDOSM: katalog metadata; data negeri/daerah apabila pipeline dijalankan |
| `search/index.json`, `search/places.json` | Indeks carian (lokasi, fizikal) dan pekan GeoNames |
| `history/{ID}.json` | Garis masa kurasi dengan rujukan |
| `quality/report.json`, `quality/flags.json` | Laporan Data Quality Engine |
| `logs/latest.json` | Ringkasan larian pipeline terakhir |
