# Seni bina

## Gambaran keseluruhan

```
Sumber rasmi ──► Raw (data/raw) ──► Validasi ──► Standardisasi ──► Padanan geografi
 UN WPP 2024        checksum         julat unit     unit → orang      NE ⇄ M49 ⇄ WB ⇄ ISO
 World Bank WDI     log import       duplikat       1 Jan / tahun     DOSM daerah ⇄ poligon
 OpenDOSM           (jsonl)          outlier        kalendar          (crosswalk + log)
 Natural Earth
 geoBoundaries
        │
        ▼
  Snapshot statik (public/data)  ──►  Pelayar (MapLibre + ECharts)  ──►  Analitik  ──►  Muat turun / laporan
        │                                  ▲
        └──► CSV export ──► Supabase (PostgreSQL + PostGIS) ── RPC / MVT / matview ──┘   (pilihan)
                                   ▲
           API langsung (WB, Wikidata, Wikipedia) ── terus dari pelayar atau melalui edge function data-proxy
```

### Tiga mod data, satu antara muka

| Mod | Bila | Apa |
|---|---|---|
| **Snapshot statik** (lalai) | Sentiasa | `public/data/**` — dijana pipeline, dihidang sebagai fail statik (gzip/brotli oleh hos). |
| **API langsung** | Data tidak ada dalam snapshot | World Bank v2, Wikidata SPARQL, Wikipedia REST — cache sesi 6 jam (`src/services/http.ts`). Gagal → *Data tidak tersedia* + sebab. |
| **Supabase** (pilihan) | `VITE_SUPABASE_URL` diset | RPC `get_series`, `get_layer`, `get_pyramid`, `search_geographies`, `geo_at_point`, `nearby_landmarks`, `mvt_boundaries`. |

Semua nilai melalui `src/services/stats.ts` → objek `Series` / `Observation` yang membawa
`sourceId`, `referencePeriod`, `quality`, `lastUpdated`, `sourceUrl`, `notes`. Komponen UI dan
eksport tidak pernah membaca angka “mentah” tanpa metadata.

## Frontend

- **React 19 + TypeScript + Vite 7**, keadaan global dengan **zustand** (`src/store/atlas.ts`).
- **MapLibre GL JS 6** (`src/maps/MapView.tsx`): gaya vektor sendiri (tiada pelayan jubin wajib),
  fon glyph Noto Sans dihoskan sendiri (`public/fonts`), unjuran glob/mercator.
- **ECharts 6** (tree-shaken) untuk carta; setiap carta ada paparan **jadual** (aksesibiliti).
- **Choropleth melalui `feature-state`** — data tidak disalin ke geometri; tukar indikator/tahun hanya
  mengemas kini keadaan ciri (pantas, tiada muat semula sumber).

### Tahap perincian (LOD) mengikut zum

| Zum | Geometri | Label/ciri |
|---|---|---|
| 0 – 2.6 | negara 1:110m | negara, ibu negara, lautan |
| 2.6 – 5 | negara 1:50m, sungai/tasik 1:50m | bandar utama (ikut `min_zoom` NE), sempadan negeri untuk negara dalam pandangan |
| ≥ 4.2 | negara 1:10m (dimuat malas), sungai/tasik 1:10m | label negeri, puncak, lapangan terbang |
| ≥ 5 | sempadan daerah (Malaysia) | label daerah (≥ 7), pelabuhan |

Sempadan negeri dimuat **per negara** (`geo/admin1/{ISO3}.topo.json`) hanya untuk negara yang
kelihatan (maksimum 5–10, terdekat dengan pusat), atau negara yang dipilih.

## Prestasi

- TopoJSON berkuantum (3–10× lebih kecil), penyederhanaan mapshaper mengikut resolusi.
- Tiada fail “seluruh dunia” besar: negeri, profil, siri UN dan mercu tanda dimuat per negara.
- Lapisan berat (jalan, kawasan metropolitan) dimuat hanya apabila diaktifkan.
- Indeks carian dimuat pada fokus pertama; indeks pekan GeoNames dimuat selepas itu.
- Cache memori + sessionStorage untuk API langsung; pecahan bundle (`maplibre`, `echarts`, `export`).
- Supabase: indeks GiST PostGIS, indeks komposit `(geo_id, indicator_code, year)`, geometri
  pra-ringkas `geom_z3`/`geom_z6` untuk MVT, materialized views `mv_latest_observation`,
  `mv_country_rank`, had baris PostgREST (`max_rows = 10000`) untuk penomboran.

## Keutamaan sumber (`src/hooks/resolve.ts`)

1. Malaysia: **OpenDOSM/DOSM** (jika dimuat dan pengguna tidak menukar ke UN).
2. **UN WPP 2024** untuk demografi negara/rantau.
3. **World Bank WDI** untuk ekonomi, buruh, dagangan, pelancongan, sosial, iklim.
4. Penunjuk **DERIVED** (kepadatan, imbangan dagangan, struktur sisa) hanya daripada input tahun sama.

## Pengecaman geografi

| Tahap | ID | Contoh |
|---|---|---|
| Dunia | `WORLD` | |
| Benua (UN M49) | `UN_{m49}` | `UN_935` Asia |
| Negara | ISO 3166-1 alpha-3 (atau kod NE untuk wilayah tanpa ISO) | `MYS`, `XKX` |
| Negeri/wilayah | Malaysia: ISO 3166-2; lain: `adm1_code` NE | `MY-10`, `JPN-1860` |
| Daerah (Malaysia) | `{ISO 3166-2}-{slug}` | `MY-10-hulu-langat` |
