---
name: video-statistik
description: Hasilkan video premium statistik (promo, panduan sistem, infografik bergerak) 60 saat dalam 16:9 dan 9:16 (TikTok/Reels) daripada data rasmi dan aplikasi WorldStat Atlas — Bumi 3D dari angkasa, penerbangan peta satelit hingga ke kampung dan jalan, dinding bendera dunia, demo UI sebenar, muzik asli dan render deterministik. Juga senarai semak domain rangkaian (DOSM, data.gov.my, World Bank, UN, GeoNames, Esri, npm, Google Fonts) yang perlu dibenarkan sebelum mula. Gunakan skill ini setiap kali pengguna minta video, klip, reel, TikTok, Shorts, montaj, animasi atau "promo" tentang statistik, data DOSM, keluaran statistik baharu, negeri/daerah/parlimen/kampung, atau aplikasi WorldStat Atlas — walaupun mereka tidak sebut "skill" atau "video premium" — dan setiap kali kerja statistik akan datang memerlukan domain luar yang mungkin disekat.
---

# Video Statistik Premium

Skill ini merakam aliran kerja yang sudah terbukti untuk video "WorldStat Atlas — Panduan & Kebolehan"
(v2.1 16:9 dan versi TikTok/Reels 9:16). Ikut urutan di bawah; setiap langkah ada sebab yang dijelaskan.
Templat dan skrip ada dalam folder skill ini — guna semula, jangan tulis dari kosong.

Bahasa: balas pengguna dalam Bahasa Malaysia, ringkas, jujur tentang had (lihat preferences pengguna).

## 0. Semak domain dahulu (paling penting)

Persekitaran awan menyekat banyak hos secara lalai. Kerja tergendala berjam-jam dalam projek asal kerana
imej satelit Esri disekat. Jadi sebelum merancang apa-apa:

```bash
bash .claude/skills/video-statistik/scripts/check_domains.sh            # semua kumpulan
bash .claude/skills/video-statistik/scripts/check_domains.sh video      # hanya yang video perlukan
```

- Jika hos yang **wajib** untuk tugasan itu `SEKAT` (kod 000 = proksi menolak), panggil `read_documentation` dengan topik
  `environment.network` (situation `blocked`) — ia memberi pengguna butang ke tetapan — kemudian beri
  senarai hos tepat untuk ditambah di **Allowed domains**. Contoh ayat:
  > "Sila tambah `server.arcgisonline.com` dan `services.arcgisonline.com` di tetapan rangkaian
  > (menu persekitaran → Edit → Network access → Allowed domains). Saya teruskan bahagian lain dahulu."
- Teruskan bahagian yang tidak bergantung pada hos itu. Jangan ganti data/imej sebenar dengan rekaan.
- Pemantau automatik (`until curl …; do sleep 30; done` dengan `run_in_background`) dihadkan 2 jam;
  jika tamat, beritahu pengguna dan minta mereka maklumkan bila domain sudah dibuka.
- Senarai penuh hos ikut tujuan, URL ujian, dan status terakhir: `references/domains.md`.
  Kemas kini fail itu jika anda menjumpai hos baharu (contoh: set data DOSM baharu di hos lain).

## 1. Fakta dahulu, reka bentuk kemudian

Pengguna bekerja di Jabatan Perangkaan; kesilapan angka lebih merosakkan daripada animasi yang kurang
cantik. Dalam projek asal video menyebut "16 negeri" dan "159 daerah" — kedua-duanya tidak tepat.

- Setiap angka di skrin mesti datang daripada fail data sebenar (`public/data/...` atau CSV DOSM mentah),
  disemak dengan skrip, bukan ingatan. Catat sumber dan tahun dalam kredit akhir.
- Peraturan istilah Malaysia (butiran & cara semak dalam `references/fakta-malaysia.md`):
  - **13 negeri + 3 Wilayah Persekutuan** (bukan "16 negeri"; jadual DOSM meletakkan W.P. dalam lajur negeri).
  - Daerah: DOSM ada **160 (2020–2024) dan 166 (2025+)**; aplikasi ada **159 poligon**. Tulis
    "159 sempadan daerah" jika merujuk peta, "166 daerah (DOSM 2026)" jika merujuk statistik.
  - 222 kawasan parlimen; 21,566 titik kampung/penempatan GeoNames (bukan statistik peringkat kampung).
- Kampung tiada statistik rasmi — sentiasa katakan panel memaparkan statistik **daerah**.
- Penafian wajib (lesen DOSM): "Projek bebas — tidak mewakili atau disahkan oleh DOSM."

## 2. Papan cerita 60 s (selari dengan muzik 96 BPM)

Satu ketukan = 0.625 s, satu bar = 2.5 s. Letak potongan babak pada ketukan supaya terasa "premium".
Garis masa yang terbukti (boleh diubah, tetapi kemas kini `scripts/score.py` serentak):

| Masa (s) | Babak | Gaya |
|---|---|---|
| 0–6.4 | Bumi 3D di angkasa + "Setiap tempat ada cerita / ada angka" | Cinematic, Kinetic Typography |
| 4.9–8.4 | Logo di atas ufuk Bumi | Title card |
| 8.125–12.6 | Dinding bendera 2.5D + kiraan "258 negara & wilayah", junam ke bendera Malaysia | Motion collage, Infographic |
| 12.45–25.3 | Angkasa → Malaysia → negeri → daerah → kampung + jalan (altitud, breadcrumb) | Drone/Aerial, Ken Burns, HUD |
| 25–36.6 | Demo UI sebenar: carian, parlimen, panel, piramid | Lottie/UI Motion, 2.5D, Lower Third |
| 36.25–40.95 | Skrin belah parlimen / kampung | Split-screen |
| 40.6–46.55 | Karusel: mesin masa, perbandingan (+bendera), tema | Motion collage |
| 46.2–52.2 | Telefon & desktop, pasang aplikasi, kemas kini sendiri | 2.5D/Isometric, UI motion |
| 51.875–55.95 | Sumber rasmi · Kualiti disemak · Muat turun | Potongan pantas |
| 55.625–60 | CTA bersih (URL, penafian, kredit) | Minimalist Clean |

Gaya yang dielakkan untuk produk data rasmi (Glitch, Retro, Doodle, Whiteboard, Stop-motion, Talking
head tanpa penyampai, Time-lapse tanpa rakaman sebenar) — sebabnya dalam `references/styles.md`.

### Untuk keluaran statistik akan datang

Bila video adalah tentang keluaran DOSM baharu (contoh: kemas kini penduduk parlimen), urutannya:
1. `check_domains.sh data` — hos sumber set data itu mesti `OK`. Cari hos sebenar dalam metadata
   katalog (`link_csv`/`link_parquet` di `raw.githubusercontent.com/data-gov-my/datagovmy-meta`);
   jika hos baharu, uji dengan `curl -sI` dan tambah ke `references/domains.md`.
2. Pastikan data dalam aplikasi sudah dikemas kini (PR "Kemas kini data automatik" mingguan sudah
   digabung, atau jalankan paip data) — supaya tangkapan skrin menunjukkan angka baharu.
3. Tarik angka tajuk terus daripada fail baharu (tarikh rujukan, nilai, perubahan) dan semak dengan
   skrip; nyatakan sama ada nilai "Anggaran" atau "Rasmi" seperti label dalam aplikasi.
4. Sesuaikan papan cerita: babak bendera/kiraan boleh diganti dengan angka utama keluaran itu;
   penerbangan peta boleh menuju kawasan yang paling berubah.

## 3. Sistem tipografi & reka letak

- Fon paparan **Plus Jakarta Sans** 700/800, badan **Inter**, HUD **JetBrains Mono**.
- Aksen warna **emas pejal #F2B84B** (tiada gradien), biru sekunder #7DB3F5, latar navy #070D18.
- "Kicker": huruf besar berjarak 0.24em + garis emas 44 px. Lower third: kad gelap, bar emas kiri.
- 16:9: jalur sinematik 2.39:1 hanya untuk bahagian sinematik (0–25 s).
- 9:16: **zon selamat teks x 70–920, y 250–1480** (atas = bar TikTok, bawah = kapsyen/butang,
  kanan = ikon). Pecah tajuk panjang kepada 2–4 baris; tiada jalur sinematik.

## 4. Sediakan ruang kerja & aset

Jalankan dari akar repo. Ruang kerja sentiasa dalam scratchpad (bukan dalam repo — aset dan video besar).

```bash
W=<scratchpad>/video                     # laluan scratchpad sesi + /video
bash .claude/skills/video-statistik/scripts/setup_workspace.sh "$W" [daerah] [gid_kampung]
#   lalai: MY-10-hulu-langat 1763768 (Kampung Sungai Tekali)
```

Ia menyalin templat & skrip, memuat turun three.js + tekstur NASA (`three-globe`), bendera
`flag-icons`, fon Google, MapLibre dari `node_modules`, jubin bijian, dan data daerah/kampung.
Kemudian tangkap skrin aplikasi **sebenar** (bina dahulu: `npm run build`, lalu
`npx vite preview --port 4173` di latar):

```bash
cd "$W"
node scripts/capture_app.mjs shots            # desktop, phone, aerial (atau pilih satu kumpulan)
python3 scripts/make_backgrounds.py .         # PNG→JPG, latar kabur, kotak carian untuk animasi taip
```

Laraskan sasaran `?geo=` dalam `capture_app.mjs` untuk cerita baharu. 9:16 guna skrin telefon sebenar.

## 5. Komposisi deterministik

Templat: `comp-16x9.html` dan `comp-9x16.html` (sudah mengandungi teks yang dibetulkan). Setiap babak
ialah `scene(a, b, z, build, draw)`; `window.render(t)` (async) menetapkan semua gaya untuk masa `t` —
tiada animasi CSS, jadi setiap bingkai boleh diulang tepat. Helper: `K/kDraw` (kinetic type;
`*kata*` = emas, `|` = baris baharu), `Kick`, `LT/ltDraw`, `Callout`, `Browser`, `Phone`, `keyed`.

Bumi 3D (`lib/earth.js`) dan peta berkongsi laluan kamera (`lib/path.js`); peralihan pada zum ≈4.55
sepadan kerana `dist = 1 + 27.3 / 2^z`. Potret mengekalkan skala piksel dengan `fov = 2·atan(960/2015)`.
Jika kampung fokus berubah, kemas kini titik akhir `lonAt`/`latAt` dalam `lib/path.js`.

Pratonton sebelum render penuh — dan **lihat** helaian kenalan itu:

```bash
cd "$W" && (python3 -m http.server 8765 --bind 127.0.0.1 &)     # hidupkan semula selepas restart bekas
node scripts/preview.mjs comp-16x9.html 1920x1080 pv 2 9.6 18.6 23.9 31.6 44 59.5
Q=desc=descv node scripts/preview.mjs comp-9x16.html 1080x1920 pvv 2 18.6 29.4 59.5
python3 scripts/contact_sheet.py pv sheet.jpg 3 640
```

## 6. Penerbangan peta ke kampung

`desc.html`: glob MapLibre + Esri World Imagery + World_Transportation (jalan & nama) +
Boundaries_and_Places + sempadan daerah emas + titik GeoNames. Setiap bingkai menunggu semua jubin.

```bash
cd "$W" && python3 scripts/proxy_spki.py spki.txt      # Chromium percaya CA proksi (bukan matikan TLS)
for i in 0 1 2 3; do VIEW=1920x1080 node scripts/desc_render.mjs desc $((i*68)) $(( i==3 ? 270 : (i+1)*68 )) > desc-$i.log 2>&1 & done
for i in 0 1 2;   do VIEW=1080x1920 node scripts/desc_render.mjs descv $((i*90)) $(((i+1)*90)) > descv-$i.log 2>&1 & done   # 9:16
```

- **Jangan hidupkan rupa bumi 3D** (`?terrain`) — ~20 s/bingkai dalam render perisian.
- 270 bingkai (9 s pada 30 fps); ~10–13 min dengan 4 proses. Potret dirender semula, bukan di-crop.
- Pantau dengan `Monitor` (`tail -F *.log | grep --line-buffered -E "done|ERR|z="`), jangan `sleep`.

## 7. Muzik asli

`python3 scripts/score.py score.wav` — pad, arp, dram, bass, whoosh dan bunyi UI pada titik masa
babak (numpy/scipy; `pip install scipy` jika tiada). Jika garis masa berubah, ubah senarai titik
dalam bahagian "transitions, impacts, UI sounds". Semak: centroid 1–2.7 kHz, tiada lonjakan sampel
besar kecuali klik yang disengajakan. Suara latar: tawarkan sahaja (ElevenLabs guna kredit pengguna).

## 8. Render, kod, semak, hantar

```bash
cd "$W" && mkdir -p seg segv chk
for i in 0 1 2 3; do node scripts/render.mjs comp-16x9.html 1920x1080 $((i*900)) $(((i+1)*900)) seg/s$i.mp4 desc=desc > seg/log$i.txt 2>&1 & done
bash scripts/mux.sh seg score.wav Video-16x9.mp4 5600                 # 9:16: segv/, desc=descv, 6000
for t in 2 9.6 16.3 18.6 23.9 31 44 50 54 59.5; do ffmpeg -loglevel error -y -ss $t -i Video-16x9.mp4 -frames:v 1 -vf scale=640:-1 chk/c-$t.jpg; done
python3 scripts/contact_sheet.py chk final-sheet.jpg 3 640
```

- 60 fps dalam 4 proses selari (~10 min) → `mux.sh` gabung, tmix ke 30 fps (motion blur), loudnorm
  −16 LUFS, two-pass (~45 MB). Master CRF (300+ MB) jangan dihantar.
- Semak helaian kenalan **fail akhir** sebelum menghantar. Hantar dengan `SendUserFile`
  (`display: render`) beserta: apa yang berubah, had yang jujur, dan kapsyen TikTok/Reels siap guna.
- Jangan commit video/aset besar ke repo; skill dan skrip sahaja.

## Masalah biasa

Lihat `references/troubleshooting.md` (CA proksi Chromium, pelayan tempatan mati selepas restart,
`rm` dengan glob relatif disekat, ID gradien SVG berganda, `img.decode()`, kilauan laut, saiz glob
semasa peralihan, label raster condong, fail terlalu besar kerana bijian).
