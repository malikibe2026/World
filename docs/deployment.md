# Deployment

Aplikasi ialah tapak statik (Vite) + data statik `public/data`. Mana-mana hos statik boleh digunakan.

```bash
npm ci
npm run build        # → dist/ (termasuk dist/data dan dist/fonts)
```

## Pilihan hos

| Hos | Tetapan |
|---|---|
| **Netlify / Vercel / Cloudflare Pages** | build `npm run build`, output `dist`. Pastikan mampatan gzip/brotli untuk `*.json` (lalai pada ketiga-tiganya). |
| **GitHub Pages** (sub-laluan) | `VITE_BASE=/World/ npm run build`, terbitkan `dist/`. |
| **Pelayan sendiri (nginx)** | `gzip_types application/json; gzip_static on;` dan `Cache-Control: public, max-age=86400` untuk `/data/`, `immutable` untuk `/assets/`. |

## Pemboleh ubah persekitaran

Salin `.env.example` → `.env.local`. **Hanya** pemboleh ubah `VITE_*` sampai ke pelayar, jadi
jangan letak rahsia di situ. `SUPABASE_DB_URL` dan `SUPABASE_SERVICE_ROLE_KEY` hanya untuk pemuat /
pipeline di mesin anda atau CI (sebagai *secret*), bukan dalam repositori.

## Content-Security-Policy (cadangan)

```
default-src 'self';
script-src 'self';
worker-src 'self' blob:;
manifest-src 'self';
img-src 'self' data: blob: https://server.arcgisonline.com https://*.tile.opentopomap.org https://s3.amazonaws.com https://commons.wikimedia.org https://upload.wikimedia.org;
connect-src 'self' https://api.worldbank.org https://query.wikidata.org https://www.wikidata.org https://en.wikipedia.org https://*.supabase.co https://s3.amazonaws.com;
style-src 'self' 'unsafe-inline';
```

## Kemas kini data

1. Jalankan pipeline (lihat `pipeline.md`) pada mesin dengan akses Internet.
2. Semak `public/data/quality/report.json` dan `public/data/logs/latest.json`.
3. Commit `public/data` (fail dijana; ditanda `linguist-generated`) dan deploy semula.
4. Jika Supabase digunakan: muat `data/exports` dengan `load_exports.sql`.

## CI

`.github/workflows/ci.yml` menjalankan semakan jenis, ujian unit dan build pada setiap push/PR.

## Auto-deploy ke Netlify (GitHub Actions)

`.github/workflows/deploy-netlify.yml` deploy ke projek Netlify `worldstat-atlas`:
production pada setiap push ke `main`, pratonton (`pr-<nombor>--worldstat-atlas.netlify.app`) untuk setiap PR.

Sekali sahaja: cipta *Personal access token* di Netlify (User settings → Applications) dan simpan sebagai
secret repositori **`NETLIFY_AUTH_TOKEN`** (GitHub → Settings → Secrets and variables → Actions).
Tanpa secret itu, kerja deploy dilangkau (CI tidak gagal). Alternatif: pautkan repo terus dalam Netlify UI.

## Aplikasi (PWA): telefon dan desktop

Laman ini juga aplikasi yang boleh dipasang (Progressive Web App) — satu kod untuk semua peranti:

| Peranti | Cara pasang |
|---|---|
| Android (Chrome, Edge, Samsung Internet) | Banner **“Pasang WorldStat Atlas”** → *Pasang*; atau menu ⋮ → *Pasang aplikasi* |
| iPhone / iPad (Safari, Chrome) | Kongsi ⬆︎ → **Tambah ke Skrin Utama** (banner memaparkan langkah ini) |
| Windows / macOS / ChromeOS (Chrome, Edge) | Ikon pasang di bar alamat, atau banner / butang *Pasang sebagai aplikasi* di bar sisi |

Bagaimana ia berfungsi:
- `public/manifest.webmanifest` + ikon dalam `public/icons/` (dijana daripada logo).
- `sw.js` dijana semasa build oleh `vite.config.ts` daripada `src/pwa/sw-template.js`, dengan **ID build**
  (commit SHA dalam CI). Halaman: rangkaian dahulu (sentiasa versi terkini bila dalam talian); kod
  aplikasi: disimpan terlebih dahulu; data: disimpan apabila dibuka. URL data membawa `?v=<ID build>`,
  jadi data deploy lama tidak pernah dipaparkan selepas deploy baharu (termasuk dari cache pelayar).
- **Kemas kini automatik**: aplikasi menyemak versi baharu apabila dibuka semula dan setiap jam.
  Jika ditemui semasa aplikasi di latar belakang, ia dipasang senyap; jika semasa digunakan, banner
  *“Versi baharu … Muat semula”* dipaparkan (tidak dipaksa di tengah kerja).
- **Luar talian**: kawasan dan statistik yang pernah dibuka boleh dilihat tanpa internet (penunjuk
  “Luar talian”). Jubin peta asas dan API langsung (World Bank, Wikidata) memerlukan internet.
- Tiada App Store / Play Store diperlukan. Jika mahu diterbitkan di Play Store kemudian, PWA ini boleh
  dibungkus sebagai *Trusted Web Activity* (akaun pembangun Google diperlukan); App Store memerlukan
  pembungkus asli (cth. Capacitor) dan akaun Apple Developer.

## Kemas kini data automatik (mingguan)

`.github/workflows/data-refresh.yml` berjalan setiap **Isnin 08:47 waktu Malaysia** (dan boleh dijalankan
bila-bila masa: GitHub → Actions → *Data refresh* → *Run workflow*):

1. Jalankan pipeline penuh dari sumber rasmi (UN WPP, World Bank, OpenDOSM, GeoNames, geodata DOSM).
   Wikidata dilangkau secara lalai kerana perlahan; tanda *wikidata* semasa larian manual untuk memasukkannya.
2. `scripts/pipeline/refresh_report.py` membandingkan hasil dengan snapshot semasa. Jika hanya metadata
   larian berubah (cap masa), tiada apa-apa dibuat.
3. Jika data berubah: typecheck, ujian dan build dijalankan; pratonton diterbitkan di
   `data-refresh--worldstat-atlas.netlify.app`; PR **“Kemas kini data automatik …”** dibuka (atau dikemas
   kini) daripada cawangan `data-refresh/auto` dengan ringkasan: dataset OpenDOSM yang dikemas kini,
   fail berubah, laporan kualiti dan perubahan sempadan yang dikesan.
4. **Tiada apa-apa diterbitkan sehingga PR digabungkan oleh manusia.** Gabungan itu mencetuskan deploy production.

Sekali sahaja: GitHub → Settings → Actions → General → *Workflow permissions* → tandakan
**“Allow GitHub Actions to create and approve pull requests”**. Tanpa tetapan ini, larian gagal pada langkah
membuka PR (data tetap ada di cawangan `data-refresh/auto`) dan GitHub menghantar e-mel kegagalan.

Nota: GitHub mematikan jadual (*schedule*) bagi repositori awam yang tiada aktiviti selama 60 hari; jika
berlaku, aktifkan semula di tab Actions.
