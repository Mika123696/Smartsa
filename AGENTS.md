# AGENTS.md — Konstitusi Proyek & Dispatcher Workflow

## 1. Intelligent Prompt Routing (Dispatcher)
Bertindaklah sebagai *dispatcher* yang memetakan setiap permintaan pengguna ke skill yang tepat sebelum bertindak:
- **Investigasi, Bugfix, Refactor, atau Pemahaman Kode:** Wajib aktifkan `.agents/skills/audit-codebase/SKILL.md` terlebih dahulu secara *read-only*.
- **Fitur Baru, Perubahan Arsitektur, atau Implementasi:** Wajib aktifkan `.agents/skills/build-feature/SKILL.md` (mulai dari klarifikasi kebutuhan, pembaruan `PRD.md`, pemecahan task di `/tasks/`, hingga eksekusi bertahap).

## 2. Aturan Keamanan & Integritas Lingkungan
- **Strict Read-Only Audit:** Dilarang memodifikasi, membuat, atau menghapus file sebelum fase audit dan rencana eksekusi disetujui pengguna.
- **Proteksi Kredensial:** DILARANG membaca, mencetak, atau menyalin isi file `.env`, `.env.local`, atau kunci rahasia lainnya.
- **Stabilitas Dev Server & HMR:** Selama sesi interaktif, gunakan mode *development* (`dev`). JANGAN menjalankan perintah *production build* penuh jika dapat merusak *state* atau *hot-reload* server pengembangan yang sedang berjalan, kecuali diminta eksplisit.
- **Sinkronisasi Dependensi:** Jika menambah atau mengubah paket, pastikan *lockfile* (`package-lock.json`, `pnpm-lock.yaml`, atau `pubspec.lock`) ikut diperbarui dan selaras.

## 3. Standar Kode & Manajemen Ruang Lingkup
- Terapkan *strict typing* (hindari `any` pada TypeScript atau `dynamic` tanpa alasan kuat pada Dart).
- Jaga konsistensi kontrak API, skema validasi input, dan penanganan *error* di seluruh modul.
- **Zero Scope Creep:** Dilarang mengubah kode di luar ruang lingkup yang tertulis di `PRD.md` dan `tasks/tasks-[nama-fitur].md`.

## 4. Referensi Perintah Proyek
| Perintah | Tujuan | Kapan Dijalankan |
| :--- | :--- | :--- |
| `npm run dev` | Menjalankan server pengembangan lokal | Saat verifikasi manual |
| `npm run lint` | Memeriksa aturan linter & static analysis | Wajib setelah setiap sub-task |
| `N/A (JavaScript ESM project)` | Memvalidasi tipe data tanpa build penuh | Wajib setelah setiap sub-task |
| `npm test -- --run` | Menjalankan unit/integration test | Wajib sebelum task ditandai selesai |
