# PRD: Core LMS Serverless Backend (EduNexa-LMS)

## 1. Introduction / Overview
- **Deskripsi Singkat:** Porting dan standardisasi modul backend serverless Vercel untuk platform EduNexa LMS yang mencakup inisialisasi identitas pengguna (`/api/bootstrap`), pendaftaran kelas terproteksi (`/api/join-class`), engine penilaian kuis pretest server-side anti-bocor (`/api/grade`), dan pembuatan signature aman untuk upload Cloudinary (`/api/upload-sign`).
- **Masalah yang Diselesaikan:** Menghilangkan ketergantungan pada endpoint eksternal yang belum selaras, menjaga isolasi kunci jawaban agar tidak bocor ke client mobile/web, mencegah eksploitasi kode kelas melalui rate limiting, serta menjamin kompatibilitas runtime penuh JavaScript ESM (`"type": "module"`) di lingkungan Vercel melalui arsitektur single dispatcher `api/index.js` (dengan modular helper di `lib/*.js` jika diperlukan).
- **Tujuan Utama:** Seluruh endpoint inti LMS berjalan stabil di Vercel Serverless (< 12 fungsi Hobby quota), dipusatkan pada single dispatcher `api/index.js`, dan lulus seluruh skenario pengujian unit & integrasi Vitest.

## 2. Goals (Tujuan Terukur)
- [x] Porting 4 endpoint inti (`/api/bootstrap`, `/api/join-class`, `/api/grade`, `/api/upload-sign`) lengkap dengan penanganan preflight CORS (`OPTIONS 204`).
- [x] Menyediakan shared helper domain institusi (`lib/domains.js` jika dimodularisasi) dan middleware otentikasi Firebase Admin (`verifyBearerToken` di `api/index.js` / `lib/firebase.js`).
- [x] Menjaga total Serverless Functions di Vercel maksimal 6 fungsi (jauh di bawah batas 12 fungsi Hobby tier, dipusatkan pada single dispatcher `api/index.js`).
- [x] Menjaga zero-regression pada JavaScript ESM runtime (`package.json "type": "module"`) dan arsitektur dispatcher `api/index.js`.
- [x] 100% tes otomatis pada `tests/api.dispatcher.test.js` (Vitest) berhasil tanpa error.

## 3. User Stories
- **Sebagai Pengguna Baru/Lama**, saya ingin profil saya diinisialisasi atau disinkronkan secara otomatis (`/api/bootstrap`) saat login/register sehingga status keanggotaan institusi (`MAHASISWA`/`DOSEN`) terverifikasi dengan akurat berdasarkan domain email.
- **Sebagai Mahasiswa/Siswa**, saya ingin bergabung ke kelas menggunakan kode unik (`/api/join-class`) secara aman dengan auto-approval jika domain email valid, atau status pending jika akun umum.
- **Sebagai Mahasiswa/Siswa**, saya ingin mengumpulkan kuis pretest (`/api/grade`) dan mendapatkan penilaian yang adil, akurat, dan transaksional tanpa risiko jawaban bocor ke inspeksi jaringan client.
- **Sebagai Pengajar (Guru) / Admin**, saya ingin mendapatkan signature resmi Cloudinary (`/api/upload-sign`) untuk mengunggah materi pembelajaran atau buku panduan PDF tanpa membocorkan kredensial rahasia server ke aplikasi mobile.

## 4. Functional Requirements (Wajib & Bernomor)
1. **Preflight CORS Handling:** Handler di `api/index.js` wajib merespons `req.method === 'OPTIONS'` dengan status 204 (`res.statusCode = 204; res.end()`) sebelum memproses logika atau otentikasi.
2. **Domain Mapping & Validation (`lib/domains.js`):** Mengimplementasikan pemetaan domain institusi dengan label boundary ketat (`kampus.ac.id`, `dosen.kampus.ac.id`, `farlean.edu`) untuk menetapkan `MAHASISWA`, `DOSEN`, atau `UMUM`.
3. **Authentication Middleware (`verifyBearerToken`):** Mengekstrak token Bearer dari header Authorization, memvalidasi integritas ID token Firebase Auth, serta menerapkan opsi `requireEmailVerified`.
4. **Endpoint User Bootstrap (`POST /api/bootstrap`):**
   - Mendukung registrasi baru (meskipun email belum diverifikasi dengan default `account_type: 'UMUM'`).
   - Melakukan evaluasi ulang domain email saat email terverifikasi untuk meningkatkan `account_type` menjadi `MAHASISWA` atau `DOSEN`.
   - Bersifat idempoten dan memperbarui `last_active`.
5. **Endpoint Join Class (`POST /api/join-class`):**
   - Memvalidasi format kode kelas alfanumerik kapital (6–12 karakter).
   - Menerapkan rate limit maksimal 5 kegagalan per 15 menit per pengguna.
   - Menjalankan transaksi Firestore atomik untuk mencari kelas, mengecek keanggotaan, dan mendaftarkan anggota baru.
6. **Endpoint Evaluasi & Bank Soal (`POST /api/grade`):**
   - Mendukung 4 aksi terproteksi token: `save_exam` (khusus `lecturer` pemilik kelas / `admin`), `instructor_keys` (khusus `lecturer` pemilik kelas / `admin`), `start`, dan `submit`.
   - Memvalidasi kepemilikan attempt, isolasi `classId` + `meetingNo` (`1–32`) + `examType` (`pretest` | `posttest`), serta mencegah kebocoran kunci ke client mahasiswa.
   - Menyimpan daftar soal bebas kunci di koleksi `exams/{classId}_m{meetingNo}_{examType}` (dibaca client anggota kelas & pengampu) dan menyimpan kunci jawaban rahasia secara **server-only** di `exam_keys/{classId}` (terstruktur di `meetings[meetingNo][examType]`, dengan `allow read, write: if false;` di `firestore.rules`).
   - Menghitung skor secara proporsional di server tanpa fallback kunci default global untuk kelas yang belum dikonfigurasi (`404 EXAM_NOT_CONFIGURED`), dan menyimpan hasil ke `exam_attempts/{classId}_m{meetingNo}_{examType}_{uid}`.
   - Bersifat idempoten jika dipanggil berulang kali untuk attempt yang sama.
7. **Endpoint Upload Signature (`POST /api/upload-sign`):**
   - Memvalidasi wewenang role (`GURU`/`lecturer` atau `ADMIN`).
   - Menerapkan rate limit maksimal 10 permintaan per 15 menit.
   - Menghasilkan signature SHA Cloudinary yang valid berdasarkan folder tujuan dan timestamp server.
8. **Fase 0 — Pembersihan Data Mock/Corrupt, Isolasi Data Kelas & CRUD Minimal Dosen:**
   - **Clean Class Creation:** Kelas baru melalui `createClassInFirestore` dibuat 100% kosong (`meetings: []`, `meetingsCount: 0`, `materialsCount: 0`, tanpa auto-seeding pertemuan, materi, video, manual book, atau soal dummy).
   - **CRUD Minimal Dosen:** Menyediakan alur UI dosen untuk menambah/mengubah/menghapus/mengunci pertemuan; mengisi materi teks/Delta JSON, URL video, dan URL Manual Book PDF per pertemuan; serta membuat/mengedit soal & kunci jawaban Pretest/Post-test per pertemuan melalui `POST /api/grade` (`action: 'save_exam'`).
   - **Zero Mock Leakage:** Menghapus fallback `src/services/mockData.js` pada runtime terautentikasi dan halaman katalog kosong; menghapus konstanta hardcoded (`buildFallbackMeetings`, `DEFAULT_SAMPLE_DELTA`, video sample `ForBiggerBlazes.mp4`, Manual Book `.txt` sintetis, `EXAM_QUESTIONS` global, `TOPIC_TO_CLASS_ID`, dan fallback `'subj_pbo'`).
   - **Strict `classId` & Ownership Isolation:** Menyelaraskan seluruh query client (`classes`, `class_members`, `assignments`, `submissions`, `attendance`, `exams`, `exam_attempts`, `discussions`, `learning_progress`) dengan filter `where(...)` yang presisi agar cocok 1:1 dengan `firestore.rules` dan `firestore.indexes.json`, sembari mempertahankan akses penuh `admin` di `AdminDashboard`.
   - **State & Storage Hygiene:** Mereset state komponen dan `sessionStorage` (`smartsa_active_exam_session`) saat berpindah kelas, berganti pertemuan, keluar ujian, atau logout.
   - **Safe Database Cleanup Script:** Menyediakan `scripts/cleanup-corrupt-data.mjs` dengan mode default `--dry-run` (wajib `--execute` untuk menghapus) dan melarang keras modifikasi atau penghapusan pada koleksi `users`.

## 5. Non-Goals (Out of Scope — Dilarang Dikerjakan)
- Mengubah skema konfigurasi modul Vite / `package.json` (`"type": "module"`).
- Membaca, mencetak, atau menyentuh kredensial `.env`, `.env.local`, atau file `*firebase-adminsdk*.json`.
- Mengubah atau merusak handler `/api/ai` yang sudah aktif di `api/index.js` (berstatus *frozen/read-only*).
- Menghapus atau memodifikasi dokumen di koleksi Firestore `users` melalui skrip cleanup, atau menjalankan penghapusan pada database live tanpa konfirmasi eksplisit pengguna.
- Melakukan `git push` otomatis ke remote repository.

## 6. Design & UI/UX Considerations
- Seluruh endpoint mengembalikan JSON berstruktur seragam: `{ success: true, ...data }` atau `{ error: 'Pesan kesalahan yang ramah dalam Bahasa Indonesia' }`.
- Status HTTP sesuai standar REST: 200 (OK), 204 (No Content / OPTIONS), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 405 (Method Not Allowed), 429 (Too Many Requests), 500 (Internal Server Error).
- Kelas baru atau pertemuan baru yang belum diisi menampilkan *empty state* yang informatif (beserta tombol aksi cepat bagi dosen pemilik kelas, dan pesan *"Belum ada materi/jadwal/tugas/evaluasi"* bagi mahasiswa).

## 7. Technical Considerations & Dependencies
- **Tech Stack:** Node.js (24.x) ESM (`"type": "module"`), Vite, Vitest, `firebase-admin@^14.5.1`, `cloudinary` (SHA-1 signature), Oxlint, dengan pola arsitektur single dispatcher di `api/index.js`.
- **Skema Koleksi Firestore Terpadu:**
  - `users/{uid}`, `classes/{classId}`, `class_members/{classId}_{uid}`, `attendance/{classId}_m{meetingNo}_{uid}`, `assignments/{assignmentId}`, `submissions/{assignmentId}_{uid}`, `exams/{classId}_m{meetingNo}_{examType}`, `exam_keys/{classId}` (server-only), `exam_attempts/{classId}_m{meetingNo}_{examType}_{uid}`, `discussions/{discussionId}`, `learning_progress/{classId}_m{meetingNo}_{uid}`.
  - Catatan: Penamaan lama `answer_keys/{testId}/items` digantikan secara resmi oleh `exam_keys/{classId}` + `exams/{classId}_m{meetingNo}_{examType}`; referensi UI `audit_logs` dibersihkan dari data palsu hingga fitur audit log server-side diimplementasikan.
- **Zero Scope Creep:** Modifikasi hanya dilakukan pada modul dan file testing yang disepakati di `PRD.md` dan `tasks/`.

## 8. Success Metrics & Acceptance Criteria
- [x] Seluruh endpoint lolos validasi preflight CORS (`OPTIONS 204`).
- [x] Lolos linting Oxlint (`npm run lint`) dengan 0 error.
- [x] Lolos build lokal Vite (`npm run build`).
- [x] Seluruh skenario pengujian di `tests/api.dispatcher.test.js` berhasil (100% PASS via Vitest).
- [x] Handler `/api/ai` tetap utuh dan fungsional tanpa regresi.
- [ ] Kelas baru yang dibuat dosen 100% kosong dari data dummy/lintas kelas dan dapat diisi secara nyata (Pertemuan, Materi Delta/Teks, Video URL, Manual Book PDF, Tugas, dan Soal+Kunci Pretest/Posttest).
- [ ] Seluruh query client, `firestore.rules`, dan `firestore.indexes.json` tersinkronisasi tanpa `permission-denied` untuk `student`, `lecturer`, dan `admin`.
- [ ] Lolos `npm run lint` dan `npm test -- --run` (100% PASS) setelah setiap sub-fase Fase 0 (0.1 → 0.2 → 0.3 → 0.4).

## 9. Open Questions
- Tidak ada. Seluruh spesifikasi telah dikonfirmasi dan disetujui pengguna.
