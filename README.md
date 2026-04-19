# MyTIX POS by GAS

Aplikasi Point of Sales (POS) tiket berbasis **Google Apps Script** dengan UI mobile-friendly, database di **Google Sheets**, dan alur checkout tunai.

## Fitur Utama

- Menampilkan daftar produk tiket per kategori.
- Keranjang belanja dan perhitungan total otomatis.
- Checkout pembayaran tunai + hitung kembalian.
- Simpan transaksi ke Google Sheet (`transactions` dan `transaction_items`).
- Seed data dummy produk otomatis saat setup awal.
- Validasi transaksi di server (harga tidak dipercaya dari frontend).

## Stack Teknologi

- Frontend: HTML, CSS, Vanilla JavaScript.
- Backend: Google Apps Script (`Code.gs`).
- Database: Google Sheets.
- Runtime Apps Script: V8.

## Struktur Project

```text
MyTIX/
|-- index.html         # UI + client logic + call google.script.run
|-- Code.gs            # Backend GAS + logic database + validasi transaksi
|-- appsscript.json    # Konfigurasi runtime & timezone
`-- README.md
```

## Arsitektur Singkat

1. User membuka Web App GAS.
2. Frontend memanggil `getProducts()` via `google.script.run`.
3. User pilih tiket dan checkout.
4. Frontend kirim payload minimal ke `createTransaction(payload)`.
5. Backend validasi item, ambil harga dari sheet `products`, hitung total di server, lalu simpan ke sheet transaksi.
6. Backend mengembalikan data transaksi final untuk ditampilkan sebagai struk.

## Prasyarat

- Akun Google aktif.
- Akses ke Google Apps Script.
- (Opsional) Node.js + `clasp` jika ingin sync project via lokal.

## Setup Cepat (Via Apps Script Editor)

1. Buka [script.new](https://script.new) untuk membuat project baru.
2. Buat file `Code.gs`, `index.html`, dan `appsscript.json`.
3. Salin isi file dari project ini ke file yang sesuai.
4. Simpan semua file.
5. Jalankan fungsi `setupDatabase()` sekali dari editor Apps Script.
6. Berikan izin akses saat diminta.
7. Cek hasil eksekusi `setupDatabase()` untuk mendapatkan `spreadsheetUrl` database.
8. Klik `Deploy` -> `New deployment`.
9. Pilih tipe `Web app`.
10. Set `Execute as`: `Me`.
11. Set `Who has access` sesuai kebutuhan operasional.
12. Klik `Deploy`, lalu buka URL Web App.

## Setup Via CLASP (Opsional)

```bash
npm install -g @google/clasp
clasp login
clasp create --type standalone --title "MyTIX POS by GAS"
clasp push
```

Setelah push, jalankan `setupDatabase()` dari editor Apps Script minimal sekali.

## Database Google Sheet

Saat pertama kali setup, sistem otomatis membuat spreadsheet database dan 3 sheet berikut:

### 1) `products`

Header:

```text
id | category | name | price | desc | is_active | created_at | updated_at
```

Contoh data dummy otomatis:

- `w1` / wisata / Tiket Terusan Dufan / 275000
- `w2` / wisata / Tiket Ragunan / 15000
- `k1` / kendaraan / Tiket Bus Trans / 3500

### 2) `transactions`

Header:

```text
transaction_id | created_at | payment_method | total | cash_received | change_amount | line_count | qty_total
```

### 3) `transaction_items`

Header:

```text
transaction_id | product_id | product_name | category | qty | unit_price | subtotal
```

## Kontrak Fungsi Backend

### `getProducts()`

Return:

```json
{
  "ok": true,
  "data": [
    {
      "id": "w1",
      "category": "wisata",
      "name": "Tiket Terusan Dufan",
      "price": 275000,
      "desc": "Akses penuh ke semua wahana."
    }
  ]
}
```

### `createTransaction(payload)`

Payload minimal:

```json
{
  "paymentMethod": "cash",
  "cashReceived": 300000,
  "items": [
    { "id": "w1", "qty": 1 },
    { "id": "k1", "qty": 2 }
  ]
}
```

Response sukses:

```json
{
  "ok": true,
  "data": {
    "transactionId": "TRX-20260419-203010-5931",
    "createdAtDisplay": "19/04/2026 20:30:10",
    "paymentMethod": "cash",
    "paymentMethodLabel": "Tunai",
    "total": 282000,
    "cashReceived": 300000,
    "changeAmount": 18000,
    "items": []
  }
}
```

## Operasional Harian

1. Tambah/ubah produk langsung di sheet `products`.
2. Set `is_active = FALSE` untuk menonaktifkan produk tanpa menghapus histori.
3. Pantau penjualan dari `transactions`.
4. Lihat rincian item dari `transaction_items`.

## Best Practices yang Dipakai

- Validasi input transaksi di backend.
- Perhitungan total menggunakan harga dari database (bukan dari client).
- Sinkronisasi write transaksi pakai `LockService`.
- Sanitasi output teks di frontend untuk mencegah injeksi HTML.
- Fallback data lokal untuk mode non-GAS saat preview statis.

## Troubleshooting

### Produk tidak muncul di Web App

- Pastikan `setupDatabase()` sudah pernah dijalankan.
- Pastikan sheet `products` memiliki data aktif (`is_active = TRUE`).

### Error saat checkout

- Pastikan `cashReceived >= total`.
- Pastikan setiap item memiliki `id` valid dan `qty > 0`.
- Cek `Executions` di Apps Script untuk detail error.

### Perubahan kode tidak terlihat

- Lakukan redeploy versi terbaru Web App.
- Refresh browser dan pastikan URL deployment yang dipakai adalah versi terbaru.

## Pengembangan Lanjutan (Opsional)

- Tambah metode pembayaran non-tunai.
- Tambah endpoint laporan harian/mingguan.
- Tambah role-based access untuk operator dan admin.

## Komunitas

Mau belajar Google Apps Script bareng, diskusi studi kasus, dan upgrade praktik production-ready?

**Join WhatsApp Group Komunitas GAS:**
https://chat.whatsapp.com/HhXHuhvQtQYAnRtR8uCil5
