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
img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://*.tile.opentopomap.org https://s3.amazonaws.com https://commons.wikimedia.org https://upload.wikimedia.org;
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
