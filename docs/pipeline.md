# Pipeline data

```
Official source → Raw data → Validation → Standardisation → Geographic matching → Supabase / snapshot → API → Map → Analytics → Download
```

Pelaksanaan: [`scripts/pipeline/run.py`](../scripts/pipeline/run.py). Setiap larian menulis log
berstruktur `data/logs/pipeline-<run_id>.jsonl` (setiap acara: masa, langkah, tahap, mesej,
konteks — URL, checksum SHA-256, kiraan baris, kod geografi) dan ringkasan
`public/data/logs/latest.json` (boleh dilihat dalam aplikasi: **Sumber → Versi dataset**).

## Persediaan

```bash
pip install -r scripts/pipeline/requirements.txt
npm install --prefix scripts/pipeline        # mapshaper, world-countries, countries-and-timezones, GeoNames
```

## Langkah

| Langkah | Rangkaian | Fungsi |
|---|---|---|
| `fetch` | GitHub raw | Muat turun Natural Earth, UN WPP 2024 (.rda), geoBoundaries MYS, sempadan parlimen DOSM, fon Noto (idempoten) |
| `reference` | — | Lambakan atribut rujukan (world-countries, IANA tz, GeoNames) |
| `registry` | — | Padanan kod NE ⇄ UN M49 ⇄ World Bank ⇄ ISO; rantau UN; log semua ketidakpadanan |
| `wpp` | — | Siri UN WPP + piramid + indikator terbitan; lapisan choropleth |
| `geo` | — | Atribut standard, penyederhanaan & TopoJSON (mapshaper), negeri per negara, daerah & kawasan parlimen Malaysia, keluasan geodesik. **Nota:** langkah ini mengosongkan `public/data/geo`, jadi jalankan semula `villages` selepasnya |
| `profiles` | — | Profil geografi melalui sambungan spatial (Shapely STRtree) |
| `search` | — | Indeks carian + laluan hierarki (point-in-polygon) |
| `villages` | download.geonames.org | Kampung & penempatan Malaysia (titik GeoNames `MY.zip`), dipadankan ke negeri → daerah; fail per negeri (`geo/places/my/`) + `search/villages-my.json`. Uji luar talian: `GEONAMES_MY_ZIP=/laluan/MY.zip` |
| `worldbank` | api.worldbank.org | Snapshot WDI (semua indikator registri) — jika gagal, pelayar guna API langsung |
| `opendosm` | github (metadata), storage.dosm.gov.my | Metadata katalog + data negeri/daerah/parlimen; padanan nama daerah dengan crosswalk; parlimen dipadankan ikut nama `P.xxx` |
| `wikidata` | query.wikidata.org | Mercu tanda per negara (SPARQL) |
| `publish` | — | Registri, sejarah kurasi, fon, `manifest.json` |
| `quality` | — | Data Quality Engine (lihat `data-quality.md`) |
| `supabase_export` | — | CSV untuk `scripts/supabase/load_exports.sql` |

```bash
python3 scripts/pipeline/run.py                         # semua
python3 scripts/pipeline/run.py --only opendosm publish quality supabase_export
python3 scripts/pipeline/run.py --skip-network
python3 scripts/pipeline/run.py --only wikidata --wikidata-only MYS IDN THA SGP
```

Langkah rangkaian **gagal dengan selamat**: ralat dilog, langkah ditanda `skipped`/`partial`,
dan aplikasi terus berfungsi dengan API langsung atau *Data tidak tersedia*.

## Larian automatik

GitHub Actions menjalankan pipeline ini setiap minggu dan membuka PR jika data berubah — lihat
[`deployment.md`](deployment.md#kemas-kini-data-automatik-mingguan). Output pipeline mesti **deterministik**
(larian berulang tanpa perubahan sumber menghasilkan fail yang sama); jangan susun output mengikut
urutan `set` Python.

## Malaysia (OpenDOSM)

Set data yang diproses (skema disahkan daripada metadata rasmi `datagovmy-meta`):

`population_malaysia`, `population_state`, `population_district`, `births_district_sex`,
`deaths_state`, `deaths_district_sex`, `marriages`, `fertility_state`, `fertility`, `lfs_district`,
`lfs_year`, `hh_income_state`, `hh_income_district`, `hh_poverty_state`, `hh_poverty_district`,
`gdp_state_real_supply`, `gdp_lookup`.

- Nilai dalam ribu (`'000`) ditukar kepada orang.
- Tahun banci → OFFICIAL; tahun antara banci → ESTIMATE; data pendaftaran (JPN) → OFFICIAL.
- Nama daerah dipadankan dengan poligon melalui
  [`data/registry/mys_district_crosswalk.json`](../data/registry/mys_district_crosswalk.json) +
  normalisasi (`Ulu`→`Hulu`, buang `W.P.`). Setiap nama yang tidak sepadan dilog sebagai
  *geographic mismatch* — **tambah pemetaan hanya selepas menyemak senarai daerah DOSM**.
- Diketahui: poligon geoBoundaries tidak mempunyai daerah W.P. Putrajaya yang berasingan (dilog).

> Persekitaran pembinaan asal menyekat `storage.dosm.gov.my`; maka snapshot dalam repositori hanya
> mengandungi **metadata** katalog DOSM. Jalankan `--only opendosm publish quality supabase_export`
> pada mesin dengan akses Internet untuk memuatkan statistik negeri/daerah.

## Menambah sumber baharu

1. Tambah rekod ke `data/registry/sources.json` (lesen, URL, kualiti lalai).
2. Tambah indikator ke `data/registry/indicators.json` (unit, format, `source_id`, formula jika DERIVED).
3. Tulis langkah dalam `scripts/pipeline/steps/` yang menulis siri dengan `year`, `value`, `quality`
   dan log setiap muat turun (`lib/http.fetch` sudah menyimpan URL, masa, checksum).
4. Jalankan `quality` dan semak `public/data/quality/report.json`.
