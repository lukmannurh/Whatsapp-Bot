# WhatsApp Bot (whatsapp-web.js + Express + PostgreSQL)

## Fitur
- Sticker dari gambar/video dengan caption `.s`
- `.ig <url>` untuk unduh media Instagram (via SaveFrom)
- Hanya bekerja di grup

## Menjalankan (Docker)
1. Salin `.env.example` menjadi `.env` dan sesuaikan.
2. `docker compose up -d --build`
3. Cek QR:
   - Lihat logs: `docker logs -f wwebjs-bot`
   - atau buka `http://localhost:3000/qr` (akan 204 jika sudah login).
4. Tambahkan bot ke grup.
   - Kirim gambar/video dengan caption `.s` → bot balas sticker.
   - Kirim `.ig <link_instagram>` → bot kirim media IG ke grup.

## Catatan
- Pastikan mematuhi ToS & hak cipta saat mengunduh media IG.
- Session WhatsApp tersimpan di volume `wwebjs_auth`.
- Log sederhana disimpan di PostgreSQL (tabel `MessageLog`, `DownloadLog`).

### Catatan fitur `.ig` (via SaveFrom)
Bot menggunakan mekanisme `sfrom.net/<url_instagram>` untuk memperoleh tautan media, kemudian mengunduh dan mengirimkannya ke grup. Jika Instagram atau SaveFrom mengubah mekanisme/anti-bot, fitur ini mungkin perlu pembaruan.


### Catatan fitur `.ig` (via Ryzumi API)
Bot menggunakan endpoint `GET https://api.ryzumi.vip/api/downloader/igdl?url=<url_instagram>`
untuk memperoleh tautan media, lalu mengunduh dan mengirimkannya ke grup.


### Perintah tambahan
- `.tagall` — Menyebut semua anggota grup (dikirim bertahap jika anggota banyak).
