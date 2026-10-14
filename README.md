# SIGAP — Sistem Informasi Gerak dan Penugasan

Web-based Operational & Workforce Management System untuk operasional pertambangan:
manpower, fleet & unit, lokasi/PIT, roster 7P–6M–1L, penugasan harian, cuti periodik,
early warning, laporan PDF/Excel, dan portal pribadi Operator & Group Leader.

---

## 1. Kebutuhan

| Perangkat | Versi |
| --- | --- |
| Node.js | 20 atau lebih baru (disarankan 22 LTS) |
| PostgreSQL | 14 atau lebih baru |
| VS Code | versi terbaru |

## 2. Cara Menjalankan (± 5 menit)

1. **Ekstrak** folder `sigap` lalu buka di VS Code (`File → Open Folder…`).
2. Buka file **`.env`**, sesuaikan password PostgreSQL Anda:
   ```
   DATABASE_URL="postgresql://postgres:PASSWORD_ANDA@localhost:5432/sigap"
   ```
3. Buka terminal VS Code (`Ctrl + ~`) dan jalankan:
   ```bash
   npm install
   npm run setup      # membuat database "sigap", tabel, dan data demo
   npm run dev
   ```
4. Buka **http://localhost:3000**

> `npm run setup` otomatis membuat database jika belum ada. Untuk mengulang data demo dari awal: `npm run db:reset`.

## 3. Akun Demo

| Peran | Nomor Pegawai | Password |
| --- | --- | --- |
| Super Admin | `SA0001` | `Admin@12345` |
| Admin Manpower | `AM0001` | `Admin@12345` |
| Operator (Ahmad Nugraha) | `OP1001` | `15051990` *(tanggal lahir, wajib diganti)* |
| GL Produksi (Budi Santoso) | `GL2001` | `20081985` *(tanggal lahir, wajib diganti)* |

Semua operator/GL lain memakai password awal **tanggal lahir format DDMMYYYY** (lihat di menu Manpower).
Data demo: 55 operator, 10 Group Leader (5 jenis × 2), 32 unit, 5 fleet, 3 PIT, contoh cuti, sakit, dan resign.

## 4. Fitur per Modul

**Public Website** — landing page (hero, fitur, tentang, kontak, footer), tanpa tombol daftar. Konten & foto dikelola admin.

**Login & Keamanan** — login nomor pegawai; password awal tanggal lahir wajib diganti; bcrypt hashing; sesi
server-side (token di-hash) yang dicabut saat akun dinonaktifkan/reset; penguncian akun setelah 5× gagal + limit
per IP; RBAC divalidasi di server (layout, setiap server action, dan API) — bukan sekadar menyembunyikan menu.

**Admin Panel**
- **Dashboard** — 10 statistik utama, info Shift 1 & 2, 4 grafik, notifikasi penting, cuti 30 hari ke depan.
- **Manpower** — Operator (multi-skill) & 5 jenis Group Leader: tambah/edit/cari/filter, status kerja, aktivasi akun, pindah penempatan.
- **Fleet & Equipment** — master unit (status operasi/standby/breakdown), setting fleet, lokasi loading, riwayat perpindahan unit.
- **Lokasi / PIT** — loading & dumping point, fleet per PIT, GL penanggung jawab, jumlah unit & operator.
- **Roster & Jadwal** — matriks roster bulanan, kalender per personel, *Buat Roster Otomatis* dengan preview 28 hari, ubah manual per rentang tanggal, cek benturan penugasan & cuti.
- **Template Shift** — ubah jam kerja permanen atau **jam khusus per tanggal** (opsional per PIT) + notifikasi ke personel terdampak.
- **Penugasan Harian** — pilih tanggal/shift/PIT/fleet; validasi (roster, skill, sakit/cuti, satu operator satu unit); *Isi Otomatis*; *Publish*; *Quick Replacement* dengan alasan; riwayat perubahan.
- **Cuti & Absensi** — estimasi cuti (hari kerja aktual), tetapkan/ubah/batalkan/akhiri cuti, akun otomatis nonaktif selama cuti; status kehadiran & tandai sakit.
- **Early Warning** — peringatan H-30/H-14/H-7/H-3/H-1 (dapat diubah), kartu *Periodic Leave Alert*, **Replacement Planning** (kandidat disaring skill, ketersediaan, libur, cuti, benturan) — pengganti hanya ditetapkan setelah review admin, opsional membuat draft penugasan.
- **Laporan** — 8 laporan dengan filter periode/lokasi/shift/kategori; preview; ekspor **PDF** & **Excel**.
- **User Management** — buat akun (personel / admin), reset password, nonaktifkan terjadwal (sakit, cuti, resign, administratif), ubah role, arsip resign.
- **Pengaturan** — pola roster, ketentuan cuti, interval notifikasi, kebijakan login, **Tampilan Website** (upload foto & logo, posisi, overlay, teks, preview, publikasi, pulihkan versi), **Audit Log**.
- **Notification Center** — cuti mendatang, operator tidak tersedia, kekurangan manpower, unit tanpa operator, benturan penugasan, perubahan jam kerja.

**Portal Operator & Group Leader** — *Penugasan Hari Ini* (unit, jenis, fleet, PIT, shift, jam kerja, istirahat; GL: jabatan, lokasi, shift) dan *Roster Saya* (kalender & tabel berwarna). Hanya data milik sendiri; tidak dapat mengubah data.

## 5. Keputusan atas Dua Poin Konfirmasi di Dokumen Konsep

Keduanya dibuat **dapat diubah** di menu Pengaturan, dengan default berikut:

1. **Libur setelah shift malam** — Hari ke-14 libur (shift malam ke-6 berakhir 06:00 hari ke-14), lalu **Hari ke-15 langsung Shift Pagi 07:00** sebagai Hari ke-1 siklus berikutnya. Tanggal roster = tanggal *mulai* shift. Setelah cuti periodik selesai, siklus dimulai ulang dari Hari ke-1.
2. **Perhitungan cuti** — dihitung dari **hari kerja aktual pada roster** (hari P & M, termasuk perubahan manual; libur dan cuti tidak dihitung) sejak mulai siklus / akhir cuti terakhir. Operator 70, GL 56, durasi 14 hari. Tanggal cuti tetap bisa disesuaikan manual.

## 6. Struktur Proyek

```
src/
├── app/
│   ├── page.tsx               # Landing page publik
│   ├── login/ ganti-password/ # Autentikasi
│   ├── admin/                 # Admin Panel (setiap folder = 1 menu, actions.ts = logika server)
│   ├── portal/                # Portal Operator & Group Leader
│   └── api/                   # Ekspor laporan & file unggahan
├── components/                # Komponen UI (ui.tsx, dialog, form, grafik, sidebar)
├── db/
│   ├── schema.ts              # Skema database (19 tabel)
│   ├── seed.ts                # Data demo
│   └── create-db.ts reset.ts
└── lib/
    ├── roster.ts              # Mesin roster & estimasi cuti
    ├── operations.ts          # Ketersediaan, kandidat pengganti, notifikasi otomatis
    ├── auth.ts                # Sesi, RBAC, password
    ├── reports.ts export.ts   # Laporan, PDF, Excel
    └── settings.ts shifts.ts dates.ts constants.ts
storage/uploads/               # Foto & logo yang diunggah admin
```

## 7. Teknologi

Next.js 15 (App Router, Server Actions) · TypeScript · Tailwind CSS · PostgreSQL · Drizzle ORM ·
Recharts · ExcelJS · jsPDF · bcryptjs · lucide-react.

Catatan terhadap rekomendasi di dokumen konsep:
- **Backend menyatu di Next.js** (Server Actions + Route Handlers) sehingga hanya satu aplikasi yang perlu dijalankan dan
  di-deploy; seluruh validasi & RBAC tetap di server. Logika bisnis terpisah di `src/lib/`, sehingga dapat dipindahkan ke
  NestJS bila kelak dibutuhkan API terpisah.
- **Drizzle ORM** dipakai sebagai pengganti Prisma (ringan, tanpa binary engine, skema TypeScript). Fungsinya setara: skema,
  migrasi (`npm run db:push`), dan query bertipe. `npm run db:studio` membuka penjelajah database.
- **Kalender** dibuat langsung dengan Tailwind (tanpa FullCalendar) agar ringan di ponsel.

## 8. Perintah Berguna

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Mode pengembangan (http://localhost:3000) |
| `npm run setup` | Buat database + tabel + data demo |
| `npm run db:reset` | Hapus semua data & isi ulang data demo |
| `npm run db:init` | Database produksi kosong + 1 akun Super Admin (tanpa data demo) |
| `npm run db:push` | Terapkan perubahan `schema.ts` ke database |
| `npm run db:studio` | Penjelajah database (Drizzle Studio) |
| `npm run build` lalu `npm start` | Mode produksi |
| `npm run typecheck` | Pemeriksaan TypeScript |

## 9. Deployment (Server Perusahaan / Cloud)

1. Siapkan PostgreSQL dan isi `DATABASE_URL` di `.env` server.
2. `npm ci && npm run db:push && npm run build && npm start` (port default 3000; gunakan PM2/systemd agar berjalan terus).
3. Pasang **HTTPS** lewat reverse proxy (Nginx/Caddy) yang meneruskan header `X-Forwarded-Proto` — cookie sesi otomatis `Secure`.
4. **Backup database** berkala, contoh cron harian: `pg_dump -Fc sigap > /backup/sigap_$(date +%F).dump`
5. Backup juga folder `storage/uploads/` (foto & logo). Untuk skala besar, folder ini dapat diganti S3-compatible storage.
6. Untuk produksi gunakan database baru **tanpa data demo**: `npm run db:init` (membuat tabel, pengaturan default, dan satu
   akun Super Admin `SA0001` / `Admin@12345` yang wajib diganti saat login pertama — bisa diubah dengan variabel
   `INIT_ADMIN_NO` dan `INIT_ADMIN_PASSWORD`). Data operator, unit, dan PIT lalu diisi lewat Admin Panel.

Zona waktu operasional diatur lewat `APP_TIMEZONE` (default `Asia/Jakarta`).

## 10. Deploy ke Netlify + Supabase

**A. Siapkan Supabase**
1. Buat project baru di supabase.com.
2. Klik **Connect → Direct**, salin dua alamat dan ganti `[YOUR-PASSWORD]` dengan password database:
   - **Session pooler** (port `5432`) — dipakai dari laptop.
   - **Transaction pooler** (port `6543`) — dipakai di Netlify.
3. **Storage → New bucket** → nama `sigap-uploads`, aktifkan **Public bucket**.
4. **Project Settings → API Keys** → salin **Project URL** dan **service_role / secret key** (rahasia).

**B. Isi database Supabase dari laptop**
1. Di file `.env`, sementara ganti `DATABASE_URL` dengan alamat **Session pooler (5432)**.
2. Jalankan `npm run setup` (dengan data demo) **atau** `npm run db:init` (kosong + 1 Super Admin).
3. Kembalikan `DATABASE_URL` di `.env` ke database lokal bila masih ingin menjalankan di laptop.

**C. Upload ke GitHub** — file `.env` tidak ikut ter-upload (sudah ada di `.gitignore`), jadi password aman.

**D. Deploy di Netlify**
1. **Add new site → Import an existing project → GitHub** → pilih repo SIGAP. Build command & publish
   directory terbaca otomatis dari `netlify.toml`.
2. Sebelum deploy, buka **Environment variables** dan isi:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | alamat **Transaction pooler (6543)** |
   | `SUPABASE_URL` | Project URL, mis. `https://xxxx.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
   | `SUPABASE_BUCKET` | `sigap-uploads` |
   | `APP_TIMEZONE` | `Asia/Jakarta` |

3. Klik **Deploy**. Setelah selesai, website dapat dibuka di `https://nama-situs.netlify.app`.

Catatan: setiap `git push` ke GitHub otomatis membuat Netlify men-deploy ulang. Perubahan struktur tabel
(`schema.ts`) dijalankan dari laptop dengan `npm run db:push` memakai alamat Session pooler.
