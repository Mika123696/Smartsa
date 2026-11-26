# Rencana Kerja Fase 1–5: Backend Hardening & Modularisasi (`api/index.js` & `lib/`)

### Notes & Aturan Pengamanan
- **Basis Saat Ini (Fase 0 Selesai):** Pembersihan data mock/corrupt, isolasi `classId` di query & Firestore Rules, serta penghapusan `devOnlyKey` / `computeLocalDevScore` dan `SERVER_EXAM_KEYS.default` sudah **selesai tuntas di Fase 0 (Sub-fase 0.1–0.4)**.
- **Single Serverless Dispatcher:** Jumlah fungsi serverless di `/api/` wajib tetap **1** (`api/index.js`, diarahkan via `vercel.json`), jauh di bawah kuota Hobby tier.
- **Proteksi `/api/ai`:** Handler `/api/ai` di `api/index.js` berstatus **frozen / read-only** dan tidak boleh rusak atau berubah perilaku.
- **Eksekusi Bertahap:** Setiap fase dijalankan berurutan dan wajib lolos `npm run lint` + `npm test -- --run` (**100% PASS**) sebelum meminta izin masuk ke fase berikutnya.

---

## Roadmap & Checklist Fase 1–5

### Fase 1 — Helper Shared `lib/domains.js` & Standarisasi CORS Backend (`api/index.js`)
- [x] **1.1** Buat modul ESM `lib/domains.js` (label boundary ketat untuk `kampus.ac.id`, `dosen.kampus.ac.id`, `farlean.edu`, serta `smartsa.edu`), mengekspor pemetaan case-insensitive (`MAHASISWA`, `DOSEN`, `UMUM`), status `autoApprove`, dan guard defensif terhadap input kosong/whitespace/email tidak valid.
- [x] **1.2** Tambahkan helper CORS terpusat (`applyCorsHeaders`) di `api/index.js` dengan header `Access-Control-Allow-Origin` (mendukung env opsional `ALLOWED_ORIGINS` comma-separated + fallback aman lokal dev & Vercel preview `*.vercel.app`), `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: Authorization, Content-Type`, dan `Vary: Origin`.
- [x] **1.3** Terapkan `applyCorsHeaders` secara konsisten pada respons preflight `OPTIONS` (204), `sendJson` (2xx), dan seluruh respons error (`400`/`401`/`403`/`404`/`405`/`500`) tanpa mengubah perilaku `/api/ai`.
- [x] **1.4** Tambahkan unit test di `tests/api.dispatcher.test.js` untuk `lib/domains.js` (seluruh varian domain & edge cases) dan header CORS pada `OPTIONS`/JSON/error, lalu verifikasi `npm run lint` + `npm test -- --run`.

### Fase 2 — Endpoint `POST /api/bootstrap` & Sinkronisasi Identitas Domain
- [x] **2.1** Tambahkan handler `POST /api/bootstrap` di `api/index.js` yang memanggil `lib/domains.js`:
  - Registrasi/login baru dengan email belum terverifikasi memperoleh `account_type: 'UMUM'` secara aman.
  - Evaluasi ulang domain saat `email_verified === true` untuk mempromosikan `account_type` ke `MAHASISWA` / `DOSEN` secara idempoten dan memperbarui `last_active`.
- [x] **2.2** Sinkronkan `resolveCallerRole` di `api/index.js` & pemetaan identitas institusi di `AuthContext.jsx` agar merujuk pada aturan `lib/domains.js`.
- [x] **2.3** Tambahkan unit test `/api/bootstrap` di `tests/api.dispatcher.test.js` dan verifikasi lint/test.

### Fase 3 — Penguatan Keamanan & Otorisasi Endpoint (`rate_limits`, `/api/upload-sign`, `/api/join-class`, `/api/grade`)
- [x] **3.1** Implementasikan rate limiter persisten berbasis transaksi Firestore pada koleksi server-only `rate_limits/{scope}_{uid}` (terkunci `allow read, write: if false;` di `firestore.rules`), mengembalikan HTTP `429 RATE_LIMIT_EXCEEDED` beserta header `Retry-After` dan CORS standar.
- [x] **3.2** Perkeras `POST /api/upload-sign`: teruskan `decodedToken` ke `handleUploadSign`, batasi akses hanya untuk `lecturer`/`admin` (`403 FORBIDDEN_ROLE`), terapkan rate limit 10 permintaan per 15 menit per UID, dan tangani dampak UI `cloudinaryService.js` pada fitur sisi mahasiswa secara eksplisit tanpa crash.
- [x] **3.3** Perkeras `POST /api/join-class`: normalisasi + validasi ketat kode `^[A-Z0-9]{6,12}$`, sinkronkan generator & validasi kode di `createClassInFirestore` (`lmsFirestoreService.js`) serta `ClassesView.jsx`, terapkan rate limit 5 kegagalan per 15 menit per UID (join sukses tidak membakar kuota), dan integrasikan `classifyAccountByEmail` (`approved` vs `pending`) secara konsisten dengan `firestore.rules` `isClassMember` dan `attendanceService.js`.
- [x] **3.4** Perkeras `POST /api/grade`: validasi status kuis `exams/{classId}_m{meetingNo}_{examType}` (`draft` -> `403 EXAM_NOT_PUBLISHED`, `archived` -> `403 EXAM_ARCHIVED`), dukung `status`/`durationMinutes`/`deadline` pada `save_exam`, serta terapkan batas waktu `deadline`/`expiresAt` + toleransi 60 detik (`403 EXAM_DEADLINE_EXCEEDED`) saat `submit`.
- [x] **3.5** Tambahkan unit test Fase 3 di `tests/api.dispatcher.test.js`, `tests/security.audit.test.js`, dan `tests/frontend.security.test.jsx`, lalu verifikasi `npm run lint` + `npm test -- --run` (**100% PASS**).

### Fase 4 — Perapian Frontend Dead Code & Konfigurasi Proxy Vite
- [x] **4.1** Hapus dead code `src/components/dashboard/GeneralDashboard.jsx` dan `src/services/mockData.js` yang sudah tidak terpakai di jalur runtime, test, maupun skrip, serta verifikasi nol kemunculan `devOnlyKey` / `computeLocalDevScore` di `ClassDetailView.jsx`.
- [x] **4.2** Tambahkan konfigurasi `server.proxy` untuk `/api` di `vite.config.js` dengan dukungan env opsional `VITE_API_PROXY_TARGET` (default `http://localhost:3000`, `changeOrigin: true`).

### Fase 5 — Verifikasi Final & Penutupan Roadmap
- [x] **5.1** Lengkapi audit statis di `tests/security.audit.test.js` (penghapusan `GeneralDashboard.jsx`/`mockData.js`, nol `devOnlyKey`/`computeLocalDevScore`, proxy `/api` di `vite.config.js`, tepat 1 fungsi serverless `api/index.js`, dan handler `/api/ai` tetap utuh/frozen), serta cek read-only kelengkapan UI approval member `pending`.
- [x] **5.2** Tandai seluruh roadmap Fase 1–5 selesai dan jalankan `npm run lint` + `npm test -- --run` (**100% PASS**). *(Catatan ruang lingkup: `npm run build` ditahan sesuai aturan stabilitas dev server di `AGENTS.md`; idempotensi `submit` penuh saat status `submitted` dan UI persetujuan dosen atas member `pending` dicatat sebagai tindak lanjut opsional di luar cakupan Fase 4–5.)*

---

## Relevant Files
- `lib/domains.js` *(baru — Fase 1)*
- `api/index.js` *(CORS — Fase 1; `/api/bootstrap` — Fase 2; `rate_limits`, `/api/upload-sign`, `/api/join-class`, `/api/grade` — Fase 3)*
- `firestore.rules` *(kunci `users`, `rate_limits`, & status `isClassMember`)*
- `src/context/AuthContext.jsx` *(migrasi `/api/bootstrap` — Fase 2)*
- `src/services/lmsFirestoreService.js` *(generator kode 6–12 & filter member aktif — Fase 3)*
- `src/services/cloudinaryService.js` *(penanganan `403 FORBIDDEN_ROLE` untuk mahasiswa — Fase 3)*
- `src/services/attendanceService.js` *(pengecekan status keanggotaan `approved`/`active` — Fase 3)*
- `src/components/features/ClassesView.jsx` *(validasi UI kode 6–12 & status `pending` — Fase 3)*
- `src/components/dashboard/GeneralDashboard.jsx` *(dihapus — Fase 4)*
- `src/services/mockData.js` *(dihapus — Fase 4)*
- `vite.config.js` *(proxy `/api` lokal dev — Fase 4)*
- `tasks/phase-1-to-4-backend-hardening.md` *(selesai)*
- `tests/api.dispatcher.test.js`
- `tests/frontend.security.test.jsx`
- `tests/security.audit.test.js`
