# Domain rangkaian untuk kerja statistik & video

Semak dengan `scripts/check_domains.sh [kumpulan]`. Kumpulan: `data`, `peta`, `video`, `deploy`, `semua`.
Status "18 Okt 2026" ialah hasil semakan terakhir dalam persekitaran awan projek ini
(200/302 = boleh capai; 000 = disekat atau tiada sambungan; 404 di akar hos biasanya masih OK).

Cara membuka: menu persekitaran di bar tajuk sesi → **Edit** → **Network access** → tambah hos di
**Allowed domains** (biarkan *Allow package managers* bertanda). Panduan:
https://code.claude.com/docs/en/cloud-environments#network-access

## 1. Data statistik (kumpulan `data`)

| Hos | Untuk apa | Wajib? | Status 18 Okt 2026 |
|---|---|---|---|
| `storage.dosm.gov.my` | CSV/Parquet OpenDOSM (penduduk negeri/daerah/parlimen, pendapatan, kemiskinan) | Ya | 200 |
| `storage.data.gov.my` | Sebahagian set data data.gov.my (`link_csv`) | Ya | 200 |
| `raw.githubusercontent.com` | Metadata katalog `data-gov-my/datagovmy-meta`, geodata DOSM (`dosm-malaysia/data-open`), UN WPP 2024 (`PPgp/wpp2024`), Natural Earth, fon peta | Ya | 200 |
| `media.githubusercontent.com` | geoBoundaries (fail LFS) | Ya (geo) | 302 |
| `api.worldbank.org` | World Bank WDI (KDNK, pengangguran, dll.) | Ya | 200 |
| `download.geonames.org` | Titik kampung `MY.zip` (CC BY 4.0) | Ya (kampung) | 200 |
| `query.wikidata.org` | Mercu tanda (SPARQL) | Pilihan | 200 |
| `api.data.gov.my` | API data.gov.my (alternatif kepada fail statik) | Pilihan | 000 — tambah jika guna API |
| `open.dosm.gov.my` | Pautan sumber di UI sahaja (pelayar pengguna) | Tidak | 000 |
| `population.un.org` | Laman WPP (rujukan sahaja; data diambil dari GitHub) | Tidak | 000 |
| `commons.wikimedia.org`, `en.wikipedia.org` | Gambar & ringkasan mercu tanda di UI (pelayar pengguna) | Tidak untuk paip | 000 |
| `newss.statistics.gov.my` | Portal penerbitan DOSM (PDF/Excel keluaran) | Jika pengguna beri pautan | belum diuji |

Untuk keluaran DOSM akan datang: semak dahulu di mana fail berada (`link_csv`/`link_parquet` dalam
metadata katalog). Jika hos baharu muncul, uji dengan `curl -sI <url>` dan tambah ke jadual ini.

## 2. Peta & imej (kumpulan `peta`)

| Hos | Untuk apa | Wajib? | Status |
|---|---|---|---|
| `server.arcgisonline.com` | Esri World Imagery (satelit), World_Street_Map, Dark Gray Canvas + Reference | Ya — babak kampung/jalan | 200 (selepas dibenarkan) |
| `services.arcgisonline.com` | Esri Reference/World_Transportation (jalan & nama jalan) | Ya — babak jalan | 200 (selepas dibenarkan) |
| `s3.amazonaws.com` | AWS Terrain Tiles (terrarium) — rupa bumi/hillshade | Pilihan (3D terlalu perlahan untuk video) | 200 |
| `*.tile.opentopomap.org` | Peta topo dalam aplikasi | Tidak untuk video | 000 |

Atribusi wajib bila imej Esri dipaparkan: "Esri, Maxar, Earthstar Geographics".

## 3. Alat video (kumpulan `video`)

| Hos | Untuk apa | Status |
|---|---|---|
| `registry.npmjs.org` | three.js, `three-globe` (tekstur NASA Blue/Black Marble), `flag-icons` (bendera, MIT) | 200 |
| `fonts.googleapis.com` + `fonts.gstatic.com` | Plus Jakarta Sans, Inter, JetBrains Mono | 200 / 404 di akar (fail fon OK) |
| `pypi.org` + `files.pythonhosted.org` | `scipy` untuk muzik | 200 |
| `server.arcgisonline.com`, `services.arcgisonline.com` | Penerbangan peta (lihat §2) | 200 |

Hos yang **tidak** dapat dicapai dan tidak diperlukan lagi: CDN bendera (`flagcdn.com`,
`cdn.jsdelivr.net`), NASA (`eoimages.gsfc.nasa.gov`, `gibs.earthdata.nasa.gov`), OSM/OpenFreeMap,
CARTO, Google tiles. Semua digantikan oleh pakej npm atau Esri di atas.

## 4. Terbitan (kumpulan `deploy`)

| Hos | Untuk apa | Status |
|---|---|---|
| `api.netlify.com` | Deploy (berjalan di GitHub Actions, bukan dalam sesi) | 404 di akar = boleh capai |
| `worldstat-atlas.netlify.app` | Laman langsung (semakan) | 000 dari sesi — semak dari pelayar/CI |

## Ayat sedia guna kepada pengguna

> "Untuk [tujuan], sesi ini perlu capai `hos1` dan `hos2`, tetapi tetapan rangkaian menyekatnya.
> Sila tambah kedua-duanya di menu persekitaran → Edit → Network access → Allowed domains, kemudian
> beritahu saya. Sementara itu saya teruskan [bahagian lain]."
