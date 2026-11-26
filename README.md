# Pantau PLN Banjarmasin

Situs statis pantauan warga atas pemadaman bergilir PLN UP3 Banjarmasin, yaitu ULP Lambung Mangkurat (data sejak 2 Nov 2026) dan ULP Ahmad Yani (data sejak 15 Nov 2026).

Saat ini, situs memiliki fitur berupa cek wilayah (+ tautan berbagi `?kel=KODE`), peta kelurahan/desa + ruas jalan, statistik siang/malam, tren harian, indeks ketimpangan (Gini) per ULP, berita otomatis, arsip poster, dan template laporan SP4N-LAPOR. Perbandingan antar-ULP memakai periode yang sama (mulai tanggal data terakhir yang tersedia di semua ULP), bisa diubah di filter.

## Isi folder

| Berkas | Fungsi |
|---|---|
| `index.html`, `assets/` | Halaman (Leaflet + JS biasa, tanpa build) |
| `config.json` | Judul, tautan Instagram/saluran WA PLN, tautan lapor.go.id |
| `data/jadwal.json` | Jadwal terverifikasi |
| `data/kelompok.json` | Kelompok wilayah + nama jalan OSM + titik penanda |
| `data/geo/*.geojson` | Batas kelurahan (BIG 2026) dan ruas jalan terdampak (OpenStreetMap) |
| `alat/bangun_geo.py` | Membangun ulang `data/geo/` setelah `kelompok.json` berubah |
| `alat/ambil_berita.py`, `.github/workflows/` | Pengambil berita RSS + jadwal otomatis |
| `n8n/` | Tiga workflow n8n (poster/WA, berita harian, penerbitan manual) + `antrean-awal.csv` |

## Berita otomatis

`alat/ambil_berita.py` mengambil dari RSS Google News (5 kueri), ANTARA Kalsel, dan RRI Banjarmasin, menyaring kata kunci PLN/listrik + Kalsel, lalu menulis `data/berita.json` (arsip lama dipertahankan, maks. 150).
Di GitHub, `.github/workflows/berita.yml` menjalankannya tiap 30 menit dan meng-commit hasilnya (Settings → Actions → Workflow permissions → Read and write). Browser tidak bisa membaca RSS langsung (CORS), jadi "realtime" di sini berarti tertunda maksimal ±30 menit. Tribun/Banjarmasin Post memblokir RSS langsung (403), tetapi beritanya tetap masuk lewat Google News.

## Fitur warga

- **Wilayah saya**: status langsung (sedang padam / padam berikutnya), *Ingatkan saya* (notifikasi 15 menit sebelum padam selama halaman terbuka) dan *Tambah ke kalender* (.ics dengan pengingat 30 menit).
- **Tautan berbagi** `?kel=B` membuka langsung kartu wilayah itu.
- **Bisa dipasang di HP** (PWA) dan tetap terbuka saat sinyal lemah/padam (data terakhir di-cache).
- Template laporan: salin, unduh .txt, cetak/simpan PDF, hapus data pribadi dari perangkat.

## Keamanan & privasi

- Content-Security-Policy ketat (hanya skrip sendiri + Leaflet dari cdnjs dengan Subresource Integrity), tanpa iframe/form eksternal.
- Semua teks dari data/berita di-escape; tautan berita hanya `http(s)`.
- Data formulir laporan hanya disimpan di `localStorage` perangkat pengguna; tidak ada server yang menerima data pribadi.
- Webhook n8n wajib *Header Auth*, form n8n wajib *Basic Auth*; tanpa itu siapa pun bisa mengisi antrean.
- `alat/validasi.py` dijalankan otomatis (`.github/workflows/validasi.yml`) untuk menolak data rusak sebelum tayang.

## Merawat data

1. Tambah/ubah jadwal (lewat Sheet + n8n, atau langsung di `data/jadwal.json`).
2. Simpan poster ke `assets/poster/<id>.jpg`, lalu `python alat/buat_gambar_kecil.py`.
3. `python alat/validasi.py` harus 0 galat.
4. Jika server OSM sedang normal, `perbarui-peta.bat` menambah ruas Jl. A. Yani ke peta.

Saat aset statis berubah, naikkan `VERSI` di `sw.js` agar HP pengguna mengambil versi baru.

## Menjalankan di laptop

Halaman memuat JSON dengan `fetch`, jadi harus lewat server web (membuka `index.html` langsung tidak jalan):

```
jalankan.bat            (atau: python -m http.server 8000)
```
lalu buka http://localhost:8000.

## Alur data: poster → AI → verifikasi manusia → situs

**Panduan lengkap (termasuk jadwal dari berita, saluran WA, Instagram, dan aturan anti-duplikat): [docs/PANDUAN-N8N.md](docs/PANDUAN-N8N.md).**

```
Form n8n (unggah poster) ─┐
                          ├─► AI vision membaca tanggal/jam/wilayah ─► Google Sheet "antrean" (status: menunggu)
Gateway WA → webhook ─────┘                                                   │ verifikator memeriksa poster,
                                                                              │ membetulkan, set status "terverifikasi"
Jadwal 15 menit ─► baca Sheet ─► bangun jadwal.json ─► commit GitHub ─► situs diperbarui
```

1. **Google Sheet**: buat spreadsheet, tab bernama `antrean`, impor `n8n/antrean-awal.csv` (berisi 22 jadwal yang sudah diverifikasi).
2. **n8n**: impor `n8n/1-masukan-poster.json` dan `n8n/2-terbitkan-jadwal.json`. Isi variabel lingkungan:
   - `PANTAU_SITE_URL` - alamat situs (untuk mengambil `kelompok.json`)
   - `PANTAU_SHEET_URL` - URL Google Sheet
   - `PANTAU_AI_URL` - endpoint chat-completions yang mendukung gambar (OpenAI, OpenRouter, dll.); `PANTAU_AI_MODEL` — nama model
   - `PANTAU_GH_OWNER`, `PANTAU_GH_REPO` - repo situs
   Lalu pasang kredensial: *Header Auth* (`Authorization: Bearer <kunci API>`) di node AI, Google Sheets OAuth, dan GitHub.
3. **Saluran WA**: WhatsApp Channel tidak punya API publik. Teruskan poster ke nomor yang terhubung ke gateway WA (yang sudah dipakai n8n), lalu arahkan gateway mengirim gambar ke webhook `pantau-pln-poster` (field binari `poster`, opsional `sumber_url`).
4. **Instagram**: tidak di-scrape (melanggar ketentuan Meta dan rawan diblokir). Unggah posternya lewat form n8n, cantumkan tautan postingannya.
5. **Verifikasi**: AI hanya mengusulkan. Cocokkan setiap baris dengan poster asli; kode kelompok `BARU` berarti blok wilayah belum dikenal (lihat bawah). Hanya baris `terverifikasi` yang tayang.

Poster: simpan gambarnya di `assets/poster/<id>.jpg` (atau URL publik) dan isi kolom `poster`.

> Workflow n8n disusun untuk n8n 1.x tetapi belum diuji di instance Anda. Uji dengan satu poster dulu; bila sebuah node menolak parameter setelah impor, pilih ulang dokumen/sheet/repo di node tersebut.

## Menambah kelompok wilayah baru

1. Tambah entri di `data/kelompok.json`: `kode` (huruf berikutnya), `nama`, `teks` (salin persis kotak wilayah), `jalan` (nama jalan persis seperti di OpenStreetMap), `jalan_bersama` (jalan "sebagian" yang dipakai beberapa kelompok; awali dengan `re:` untuk pola regex, mis. `re:(?i)ahmad yani`), `radius_km` (batas jarak ruas dari titik penanda, bawaan 2,2 km), `titik` [bujur, lintang], `kelurahan_tambahan`.
2. Jalankan `python alat/bangun_geo.py` (butuh `pip install shapely`). Skrip mencetak nama jalan yang tidak ditemukan di OSM.
3. Sumber mentah di `alat/sumber/`: `kelurahan_bjm_big.geojson` (dari BIG 2026) dan `roads.json` (Overpass). Untuk menyegarkan jalan, jalankan ulang kueri Overpass (lihat `D:\Project\pantau-anggaran\bahan-peta\osm\q3.txt`).

## Batasan

- Hanya menampilkan pengumuman resmi PLN; tiap angka bisa ditelusuri ke posternya.
- Pemetaan jalan → kelurahan adalah perkiraan dan bukan peta jaringan PLN.
- Cakupan hanya ULP Lambung Mangkurat dan ULP Ahmad Yani. Wilayah yang tidak muncul ≠ tidak pernah padam.
- Koreksi data dicatat di kolom `catatan_verifikator` pada Sheet.
