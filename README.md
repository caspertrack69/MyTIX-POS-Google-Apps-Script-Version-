# MyTIX POS (GitHub Pages + Google Apps Script API)

MyTIX POS adalah aplikasi kasir tiket (POS) dengan frontend static di **GitHub Pages** dan backend API di **Google Apps Script** menggunakan **Google Sheets** sebagai database.

## Fitur Utama

- List produk tiket per kategori.
- Keranjang + checkout tunai + hitung kembalian.
- Simpan transaksi ke Google Sheet.
- Data produk dummy otomatis saat setup awal.
- Cetak struk thermal Bluetooth (Web Bluetooth) dari browser yang support.

## Preview

| Home | Checkout |
| --- | --- |
| ![MyTIX Preview Home](preview/Screenshot%202026-04-19%20232919.png) | ![MyTIX Preview Checkout](preview/Screenshot%202026-04-19%20232929.png) |

| Receipt Modal | Payment Flow |
| --- | --- |
| ![MyTIX Preview Receipt](preview/Screenshot%202026-04-19%20232945.png) | ![MyTIX Preview Payment](preview/Screenshot%202026-04-19%20233000.png) |

## Arsitektur

1. Frontend (`index.html`) di-host di GitHub Pages.
2. Frontend memanggil API Apps Script (`/exec?action=...`) via `fetch`.
3. Apps Script membaca/menulis data ke Google Sheets.
4. Printer thermal Bluetooth dipanggil langsung dari browser frontend (bukan dari Apps Script).

## Stack

- Frontend: HTML, CSS, Vanilla JS.
- Backend API: Google Apps Script (`Code.gs`).
- Database: Google Sheets.
- Hosting frontend: GitHub Pages.

## Struktur Project

```text
MyTIX by GAS/
|-- index.html
|-- Code.gs
|-- appsscript.json
`-- README.md
```

## 1) Setup Backend API (Google Apps Script)

1. Buka [script.new](https://script.new).
2. Isi `Code.gs` dan `appsscript.json` dari project ini.
3. Simpan.
4. Jalankan `setupDatabase()` sekali untuk inisialisasi DB + dummy data.
5. Deploy sebagai Web App:
   - `Deploy` -> `New deployment`
   - Type: `Web app`
   - `Execute as`: `Me`
   - `Who has access`: `Anyone` / `Anyone with the link` (sesuai kebutuhan)
6. Salin URL deployment `/exec`.

Contoh URL:

```text
https://script.google.com/macros/s/AKfycb.../exec
```

## 2) Setup Frontend (GitHub Pages)

1. Buat repository GitHub baru.
2. Upload minimal file `index.html`.
3. Di repo: `Settings` -> `Pages`.
4. Source: `Deploy from a branch`.
5. Branch: `main`, Folder: `/ (root)`.
6. Simpan dan tunggu URL GitHub Pages aktif.

Contoh:

```text
https://username.github.io/mytix-pos/
```

## 3) Konfigurasi URL API di Frontend

Frontend membaca URL API dari prioritas berikut:

1. Query param `?api=...`
2. Global `window.MYTIX_API_EXEC_URL`
3. `DEFAULT_API_EXEC_URL` di `index.html`

Untuk testing printer, frontend juga mendukung override query:

- `?lang=esc-pos|star-prnt|star-line`
- `?cp=epson|xprinter|pos-5890|mpt|star|...`
- `?cols=32|35|42|44|48` (atur lebar kolom struk)

### Opsi permanen

Edit `DEFAULT_API_EXEC_URL` di `index.html` ke URL `/exec` milikmu.

## Endpoint API

### GET produk

```http
GET /exec?action=products
```

Response:

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

### POST transaksi

```http
POST /exec?action=create-transaction
Content-Type: text/plain
```

Body:

```json
{
  "action": "create-transaction",
  "payload": {
    "paymentMethod": "cash",
    "cashReceived": 300000,
    "items": [
      { "id": "w1", "qty": 1 },
      { "id": "k1", "qty": 2 }
    ]
  }
}
```

### GET health

```http
GET /exec?action=health
```

### GET setup DB (opsional)

```http
GET /exec?action=setup-db
```

## Struktur Database Google Sheet

Saat setup awal, sistem membuat 3 sheet:

1. `products`

```text
id | category | name | price | desc | is_active | created_at | updated_at
```

2. `transactions`

```text
transaction_id | created_at | payment_method | total | cash_received | change_amount | line_count | qty_total
```

3. `transaction_items`

```text
transaction_id | product_id | product_name | category | qty | unit_price | subtotal
```

## Catatan Penting Bluetooth Thermal

- Harus dibuka dari halaman HTTPS top-level (GitHub Pages), bukan panel preview Apps Script.
- Gunakan browser yang mendukung Web Bluetooth (umumnya Chrome Android).
- Jika gagal reconnect printer, hubungkan ulang via tombol `Hubungkan Printer Bluetooth`.

## Troubleshooting

### Produk tidak muncul

- Cek URL API `/exec` benar.
- Cek deployment Apps Script terbaru.
- Cek endpoint `?action=health` dan `?action=products`.

### Checkout gagal

- Pastikan payload transaksi valid (`cashReceived`, item ID, qty).
- Cek logs di Apps Script (`Executions`).

### Bluetooth diblokir

- Jangan buka app dari iframe/editor panel.
- Buka langsung URL GitHub Pages di tab browser.

### Error `Unknown codepage mapping`

1. Hard refresh halaman GitHub Pages (`Ctrl+F5`) untuk memastikan JS terbaru ter-load.
2. Reconnect printer lewat tombol `Hubungkan Printer Bluetooth`.
3. Coba pakai override mapping di URL:

```text
https://username.github.io/mytix-pos/?cp=epson
```

atau:

```text
https://username.github.io/mytix-pos/?cp=xprinter
```

4. Jika printer Star mode, coba set language:

```text
https://username.github.io/mytix-pos/?lang=star-prnt
```

5. Jika hasil cetak kurang proporsional, coba sesuaikan kolom:

```text
https://username.github.io/mytix-pos/?cols=42
```

atau:

```text
https://username.github.io/mytix-pos/?cols=48
```

## Komunitas

Mau belajar Google Apps Script bareng, diskusi studi kasus, dan upgrade praktik production-ready?

**Join WhatsApp Group Komunitas GAS:**
https://chat.whatsapp.com/HhXHuhvQtQYAnRtR8uCil5
