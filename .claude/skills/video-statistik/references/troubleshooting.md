# Masalah biasa dan penyelesaian (semuanya berlaku dalam projek asal)

| Gejala | Punca | Penyelesaian |
|---|---|---|
| `curl` 000 / `connect_rejected` | Hos tidak dibenarkan oleh proksi | `scripts/check_domains.sh`; minta pengguna tambah hos (references/domains.md) |
| Jubin peta gagal dalam Chromium: `ERR_CERT_AUTHORITY_INVALID` | Chromium Playwright tidak percaya CA proksi | `python3 scripts/proxy_spki.py spki.txt` lalu `--ignore-certificate-errors-spki-list` (sudah dalam `desc_render.mjs`). Jangan matikan TLS |
| Halaman `127.0.0.1:8765` / `localhost:4173` kosong (000) | Bekas dimulakan semula, pelayan mati | Hidupkan semula `python3 -m http.server 8765 --bind 127.0.0.1` dan `npx vite preview --port 4173`; jana semula `spki.txt` |
| `rm` disekat ("Dangerous rm operation") | Glob relatif selepas `cd` | Guna folder baharu atau laluan mutlak; jangan cuba memintas semakan |
| ~20 s/bingkai dalam penerbangan peta | Rupa bumi 3D (`terrain`) dalam render perisian | Jangan guna `?terrain`; pandangan condong 2.5D |
| Frame pertama render lambat/ada jubin kosong | Jubin belum dimuat | `window.frame(t)` menunggu `idle`; bingkai pertama setiap proses ambil masa — normal |
| Logo/ikon SVG pudar dalam babak kemudian | ID `linearGradient` berganda; rujukan ke elemen dalam babak tersembunyi | Jana ID unik setiap salinan (`globe()` dalam templat) |
| Imej tidak muncul pada bingkai pertama babak | Belum didekod | `await img.decode()` semasa `ready`; untuk bingkai peta, `await S4.img.decode()` setiap tukar `src` |
| Tompok putih di laut pada Bumi 3D | Pantulan spekular terlalu kuat | Specular dibuang dalam `earth.js`; jangan tambah semula |
| Peralihan Bumi → peta "melompat" | Saiz cakera glob tidak sepadan | `dist = 1 + 27.3/2^z`; untuk potret kekalkan f = 2015 px (`fov = 2·atan(960/2015)`) |
| Label jalan herot dalam pandangan condong | Label Esri ialah raster yang ditampal | Had pitch ~60°; label kampung sendiri (`text-pitch-alignment: viewport`) kekal tegak |
| Babak terhenti 45 s | `idle` tidak berlaku (contoh: jubin gagal) | Ada tamat masa 45 s dalam `desc.html`; semak log `maperr` |
| Master MP4 300+ MB | Bijian filem susah dimampat | Hantar hasil two-pass (~45 MB) daripada `mux.sh`, bukan master |
| Pemantau latar belakang dihentikan | Had 2 jam `run_in_background` | Jangan mula semula; beritahu pengguna dan minta mereka maklumkan |
| Teks 9:16 dilindungi butang TikTok | Di luar zon selamat | Teks dalam x 70–920, y 250–1480 sahaja |
| Pulau dinamik menutup bar atas aplikasi | Tangkapan skrin tiada bar status | `Phone()` dalam templat 9:16 menambah bar status palsu "9:41" |
| Atribusi peta aplikasi kelihatan di bawah babak belah | Tangkapan skrin termasuk bar atribusi | Laraskan `cy` crop supaya baris atribusi keluar bingkai |
