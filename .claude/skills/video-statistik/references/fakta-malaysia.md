# Fakta unit pentadbiran Malaysia — sebut dengan tepat

Semak setiap angka dengan data, bukan ingatan. Skrip semakan di hujung fail.

## Negeri dan Wilayah Persekutuan

- **13 negeri**: Johor, Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang, Pulau Pinang, Perak, Perlis,
  Selangor, Terengganu, Sabah, Sarawak.
- **3 Wilayah Persekutuan**: W.P. Kuala Lumpur, W.P. Labuan, W.P. Putrajaya.
- Jadual DOSM (dan fail `stats/my/admin1.json` aplikasi) menyenaraikan 16 unit dalam lajur "negeri".
  Dalam video atau slaid awam, tulis **"13 negeri dan 3 wilayah persekutuan"**, bukan "16 negeri".

## Daerah

| Sumber | Bilangan | Nota |
|---|---|---|
| DOSM `population_district` 2020–2024 | 160 | termasuk 3 W.P. sebagai unit daerah |
| DOSM `population_district` 2025, 2026 | **166** | +6 daerah baharu: Membakut (Sabah); Gedong, Lingga, Pantu, Sebuyau, Siburan (Sarawak) |
| Poligon peta aplikasi (geoBoundaries) | **159** | Putrajaya tiada poligon; daerah baharu belum ada sempadan terbuka |

Jadi: "159 sempadan daerah" (peta) atau "166 daerah (DOSM 2026)" (statistik) — jangan "159 daerah".
Daerah baharu menyebabkan "putus siri" (structural break) — aplikasi menanda graf dan tidak mengira
kepadatan merentasinya.

## Lain-lain

- **222 kawasan parlimen** (P.001–P.222), sempadan daripada geodata DOSM (Lesen Data Terbuka DOSM —
  dilarang membayangkan status rasmi/pengesahan DOSM).
- **21,566 titik kampung/penempatan** GeoNames (CC BY 4.0) — tiada statistik peringkat kampung; panel
  memaparkan statistik **daerah** yang melingkunginya.
- **258 negara & wilayah** dalam pendaftar aplikasi (Natural Earth + UN WPP); 245 ada kod ISO-2 dan bendera.
- **74 penunjuk** statistik (`public/data/meta/indicators.json`).
- Penduduk dunia: UN WPP 2024 — "lebih 8 bilion" (8.2 bilion pada 2025). Jangan bundarkan ke atas.

## Skrip semakan (jalankan dari akar repo)

```bash
python3 - <<'EOF'
import json, csv, io, glob, os
d = 'public/data/'
a1 = json.load(open(d + 'stats/my/admin1.json'))['units']; print('admin1 units', len(a1))
a2 = json.load(open(d + 'stats/my/admin2.json'))['units']; print('admin2 (poligon) units', len(a2))
pa = json.load(open(d + 'stats/my/parlimen.json'))['units']; print('parlimen', len(pa))
vi = json.load(open(d + 'geo/places/my/index.json')); print('kampung', sum(s['count'] for s in vi['states'].values()))
print('negara', len(json.load(open(d + 'meta/countries.json'))), 'penunjuk', len(json.load(open(d + 'meta/indicators.json'))))
# daerah DOSM mengikut tahun, daripada CSV mentah yang dicache oleh paip data
for f in glob.glob('data/raw/http/*.json'):
    if json.load(open(f)).get('url', '').endswith('population_district.csv'):
        rows = csv.DictReader(io.StringIO(open(f[:-5] + '.bin', 'rb').read().decode('utf-8', 'replace')))
        by = {}
        for r in rows: by.setdefault(r['date'], set()).add((r['state'], r['district']))
        print({k[:4]: len(v) for k, v in sorted(by.items())})
EOF
```
