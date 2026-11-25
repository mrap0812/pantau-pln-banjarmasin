# Panduan n8n: jadwal pemadaman semi-otomatis

> **Mode yang aktif sekarang: jadwal dari berita, tanpa n8n dan tanpa AI.**
> GitHub Actions (`.github/workflows/berita.yml`) menjalankan `alat/jadwal_dari_berita.py` tiap 30 menit:
> membaca artikel "Jadwal Pemadaman Listrik di Banjarmasin …" di Banjarmasin Post/Tribun (yang menyalin
> pengumuman PLN kedua ULP), mencocokkan blok wilayah ke `data/kelompok.json`, lalu menambah jadwal baru
> ke `data/jadwal.json`. Kunci anti-duplikat: ULP + tanggal + jam mulai + jam selesai. Blok wilayah yang
> tidak dikenali **tidak** ditayangkan; daftarnya ada di `data/perlu_tinjau.json` dan di ringkasan run
> Actions. Bila muncul wilayah baru, tambahkan kelompoknya di `kelompok.json`.
>
> Uji manual: `python alat/jadwal_dari_berita.py --kering` (hanya menampilkan, tidak menulis).
>
> Jalur n8n di bawah tetap bisa dipakai kapan saja sebagai tambahan (poster/WA) karena memakai kunci yang sama.

Empat jalur masuk, satu antrean, satu pintu terbit:

```
 (A) Form unggah poster  ─┐
 (B) Saluran WA → gateway ─┼─► AI membaca ─► Buang duplikat ─► Sheet "antrean" (status: menunggu)
 (C) Berita hari ini      ─┘                       ▲                     │
 (D) Ketik manual di Sheet ────────────────────────┘                     │ verifikator: cocokkan dengan poster/
                                                                         │ pengumuman resmi → status "terverifikasi"
                                     Workflow 2 (tiap 15 menit) ◄────────┘
                                     → data/jadwal.json → GitHub → situs
```

## Aturan anti tumpang-tindih

Setiap baris punya kolom **`kunci`** = `ulp | tanggal | mulai | selesai | kode kelompok` (diurutkan).
Jika kode kelompok belum dikenal, dipakai teks wilayah yang dinormalkan.

1. **Sebelum masuk antrean**: node *Buang duplikat* membaca Sheet dan membuang usulan yang kuncinya sudah ada, dari sumber mana pun. Jadwal yang sama dari poster, WA, dan berita hanya tercatat sekali.
2. **Artikel berita** yang URL-nya sudah pernah diproses tidak dibaca ulang (hemat biaya AI).
3. **Saat terbit**: Workflow 2 hanya mengambil baris `terverifikasi`, dan bila ada dua baris berkunci sama yang terverifikasi, hanya satu yang tayang.
4. **Prioritas sumber** saat verifikasi: poster/pesan resmi PLN (A, B, D) > berita (C). Berita adalah sumber sekunder: barisnya ditandai di `catatan_verifikator` dan wajib dicocokkan dengan pengumuman resmi sebelum diverifikasi.
5. **Jadwal berubah** (PLN merevisi jam): jangan menimpa. Ubah status baris lama menjadi `dibatalkan`, verifikasi baris baru.

Status yang dipakai: `menunggu` → `terverifikasi` / `ditolak` / `dibatalkan`.

## Persiapan sekali saja

1. **Google Sheet**: buat spreadsheet, tab `antrean`, impor `n8n/antrean-awal.csv` (sudah berisi kolom `kunci`).
2. **Impor workflow** ke n8n: `1-masukan-poster.json`, `2-terbitkan-jadwal.json`, `3-jadwal-dari-berita.json`.
3. **Variabel lingkungan n8n**:
   | Variabel | Isi |
   |---|---|
   | `PANTAU_SITE_URL` | alamat situs GitHub Pages |
   | `PANTAU_SHEET_URL` | URL Google Sheet |
   | `PANTAU_AI_URL`, `PANTAU_AI_MODEL` | endpoint chat-completions yang bisa membaca gambar (OpenAI/OpenRouter/dll.) dan nama modelnya |
   | `PANTAU_GH_OWNER`, `PANTAU_GH_REPO` | pemilik dan nama repo situs |
4. **Kredensial**: Google Sheets OAuth; GitHub (token *fine-grained* hanya untuk repo ini, izin *Contents: Read and write*); Header Auth untuk AI (`Authorization: Bearer …`); Header Auth untuk webhook WA (mis. `X-Pantau-Kunci: <acak panjang>`); Basic Auth untuk form.
5. Aktifkan ketiga workflow. Uji dulu dengan satu poster.

## Jalur per sumber

### (A) Unggah manual — paling andal
Buka URL form dari node *Form unggah poster*, unggah gambar, isi tautan sumber (postingan IG/WA). Cocok untuk relawan.

### (B) Saluran WhatsApp PLN
WhatsApp Channel **tidak punya API** untuk membaca kanal milik orang lain. Cara yang bisa dipakai:
- Ikuti saluran "PLN Menyapa ULP Ahmad Yani" / ULP Lambung Mangkurat di HP, lalu **teruskan (forward)** posternya ke nomor yang tersambung ke gateway WA Anda (WAHA, Evolution API, Fonnte, dll.).
- Atur gateway agar pesan bergambar dari nomor relawan yang diizinkan dikirim ke webhook `…/webhook/pantau-pln-poster` (field binari `poster`, opsional `sumber_url`) dengan header `X-Pantau-Kunci`.
- Pesan teks (mis. "Informasi Padam Emergency") bisa dikirim sebagai gambar tangkapan layar; AI membaca teksnya sama baiknya.

### (C) Berita hari ini — otomatis
Workflow 3 berjalan tiap 30 menit pukul 06–22 WITA: mencari "jadwal pemadaman listrik Banjarmasin" di Google News (24 jam terakhir), mengambil artikel hari ini, membuang artikel yang sudah diproses, lalu AI mengekstrak jadwal khusus ULP Lambung Mangkurat dan ULP Ahmad Yani. Catatan:
- Media lokal (Tribun, Warta Banjar) biasanya menyalin poster PLN, jadi hasilnya sering sama dengan jalur A/B; aturan kunci di atas mencegah dobel.
- Sebagian situs menolak robot (403) atau memakai halaman perantara Google; artikel seperti itu dilewati otomatis.
- Gunakan hanya untuk mengambil fakta jadwal; jangan menyalin isi artikel ke situs.

### (D) Instagram
Instagram tidak menyediakan API untuk membaca akun orang lain, dan *scraping* melanggar ketentuan Meta serta cepat diblokir. Pilihan yang aman: relawan menyalin tautan postingan + mengunggah posternya lewat jalur A. Layanan pihak ketiga pengubah IG ke RSS ada, tetapi tidak resmi, berbayar, dan bisa berhenti sewaktu-waktu; bila dipakai, arahkan keluarannya ke jalur A, bukan langsung ke situs.

### (E) Ketik langsung di Sheet
Tambahkan baris dengan status `menunggu` (atau langsung `terverifikasi` bila Anda sendiri yang mencocokkan). Kolom `kunci` boleh dikosongkan; Workflow 2 tetap mencegah dobel saat terbit.

## Sesudah jadwal terbit
- Simpan poster ke `assets/poster/<id>.jpg`, jalankan `python alat/buat_gambar_kecil.py`.
- GitHub Actions *Validasi data* akan gagal (merah) bila ada data rusak; perbaiki barisnya di Sheet.
