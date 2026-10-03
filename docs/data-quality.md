# Enjin kualiti data

Dua lapisan:

1. **Pipeline** — [`scripts/pipeline/steps/quality.py`](../scripts/pipeline/steps/quality.py) atas snapshot penuh →
   `public/data/quality/report.json` + `flags.json` (dilihat dalam aplikasi: **Kualiti data**).
2. **Runtime** — [`src/utils/quality.ts`](../src/utils/quality.ts) atas data langsung (World Bank, OpenDOSM API)
   dan set perbandingan, sebelum dipaparkan. Diuji dalam `src/utils/quality.test.ts`.

| Semakan | Pipeline | Runtime | Tindakan |
|---|---|---|---|
| `missing_values` | jurang dalam siri; entiti tanpa statistik | tiada nilai untuk lokasi dibandingkan | *Data tidak tersedia* — tiada imputasi |
| `duplicate_records` | kunci (geo, tahun) berganda; ID registri/carian berganda | (geo, indikator, tahun, sumber) berganda | simpan yang pertama, log |
| `outliers` | lonjakan populasi > 12%/tahun; skor-z teguh (median/MAD) > 5; nilai luar julat lazim | lonjakan > 50% tahun-ke-tahun; skor-z teguh | **ditanda, tidak dibuang** (kejutan sebenar wujud) |
| `year_mismatch` | konvensyen stok (1 Jan) vs aliran (tahun kalendar); sempadan anggaran/unjuran; DOSM pertengahan tahun vs UN 1 Jan | perbandingan dengan tahun rujukan berbeza | tahun dipaparkan di sebelah setiap nilai; amaran |
| `geographic_mismatch` | poligon tanpa statistik, statistik tanpa poligon, liputan berbeza (France/Netherlands seberang laut), daerah DOSM tidak sepadan, Putrajaya | — | dilog dan dipaparkan |
| `unit_mismatch` | nilai mustahil untuk unit (cth. kadar per 1,000 > 1,000; peratus > 100); piramid ≠ jumlah; imbangan demografi | nilai mustahil untuk unit | ralat — perlu siasatan |

Contoh hasil larian semasa: tiada `unit_mismatch` ralat; outlier sebenar seperti Rwanda 1994 (CDR)
dan Kuwait 1990–1991 (perubahan penduduk) ditanda sebagai *info/warning* untuk semakan.
