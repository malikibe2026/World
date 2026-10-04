# Sumber data & lesen

Registri penuh: [`data/registry/sources.json`](../data/registry/sources.json). Setiap rekod
statistik menunjuk kepada satu sumber; angka daripada sumber berbeza **tidak digabungkan** tanpa
menyimpan metadata masing-masing.

| ID | Sumber | Penerbit | Lesen | Mod | Kegunaan |
|---|---|---|---|---|---|
| `un_wpp_2024` | World Population Prospects 2024 (pakej R `wpp2024` 1.1-3) | UN DESA Population Division | CC BY 3.0 IGO | snapshot | Penduduk, umur & jantina, vital, unjuran 2024–2100, agregat dunia/benua |
| `wb_wdi` | World Development Indicators (API v2) | World Bank | CC BY 4.0 | langsung / pipeline | Ekonomi, buruh (ILO), dagangan, pelancongan (UN Tourism), bandar (UN WUP), keluasan (FAO), IMR (UN IGME), iklim (FAO AQUASTAT) |
| `dosm_opendosm` | OpenDOSM / data.gov.my | Jabatan Perangkaan Malaysia | CC BY 4.0 | pipeline | Penduduk nasional/negeri/daerah, kelahiran, kematian, kesuburan, perkahwinan, LFS, pendapatan isi rumah, kemiskinan, KDNK negeri |
| `natural_earth` | Natural Earth 1:10m/50m/110m | NACIS | Domain awam | snapshot | Sempadan negara/negeri, bandar, sungai, tasik, puncak, laut, lapangan terbang, pelabuhan, jalan, kawasan bandar |
| `geoboundaries` | geoBoundaries gbOpen MYS ADM1/ADM2 | William & Mary geoLab | CC BY 3.0 (huluan citypopulation.de) | snapshot | Poligon negeri & daerah Malaysia |
| `geonames` | GeoNames (melalui `cities.json`, `all-the-cities`) | GeoNames | CC BY 4.0 | snapshot | Carian pekan (cth. Kajang) — populasi GeoNames **tidak** dipaparkan sebagai statistik |
| `world_countries` | mledoze/countries | penyumbang | ODbL 1.0 | snapshot | Atribut rujukan (ibu negara, bahasa, mata wang, kod panggilan) |
| `iana_tz` | IANA tz (countries-and-timezones) | IANA | domain awam / MIT | snapshot | Zon masa |
| `wikidata` | Wikidata | Wikimedia | CC0 | langsung / pipeline | Mercu tanda, peristiwa sejarah automatik |
| `wikipedia` | Ringkasan Wikipedia | Wikimedia | CC BY-SA 4.0 | langsung | Ringkasan mercu tanda (dengan pautan) |
| `worldstat_derived` | Indikator terbitan | — | ikut input | snapshot | Lihat kamus data |
| `worldstat_curated` | Garis masa kurasi | — | CC BY 4.0 | snapshot | Sejarah Malaysia dengan rujukan |

### Peta asas pihak ketiga (bukan data statistik)

| Lapisan | Lalai | Terma |
|---|---|---|
| Jalan | Esri World Street Map / Dark Gray Canvas (data termasuk © OpenStreetMap) | <https://www.esri.com/en-us/legal/terms/full-master-agreement> |
| Satelit | Esri World Imagery | <https://www.esri.com/en-us/legal/terms/full-master-agreement> |
| Rupa bumi | OpenTopoMap (CC-BY-SA) | <https://opentopomap.org/about> |
| Ketinggian | AWS Terrain Tiles (Terrarium) | <https://registry.opendata.aws/terrain-tiles/> |

Untuk produksi berskala, gantikan dengan pembekal berlesen melalui `VITE_BASEMAP_*`.

## Nota penting tentang sumber

- **UN WPP vs DOSM (Malaysia)**: kaedah, liputan bukan warganegara dan tarikh rujukan berbeza; jangan
  dibandingkan tahun-dengan-tahun tanpa nota. Aplikasi memaparkan nota ini.
- **Natural Earth “France”/“Netherlands”** merangkumi wilayah seberang laut yang UN laporkan berasingan
  (ditanda sebagai *geographic mismatch*).
- **Wikidata** ialah sumber orang ramai; digunakan untuk rujukan mercu tanda sahaja, bukan statistik.
- **Gambar** dipaparkan daripada Wikimedia Commons dengan pautan ke halaman lesen fail.
