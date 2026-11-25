---
name: build-feature
description: Gunakan skill ini saat merancang, memecah task, atau mengimplementasikan fitur baru secara terstruktur menggunakan alur Clarifying Questions -> PRD.md -> Two-Phase Task List -> Incremental Execution.
---

# Structured Feature Development Workflow

## Tahap 1: Klarifikasi & Penyusunan PRD (`create-prd` Protocol)
1. **Ajukan Pertanyaan Klarifikasi Terlebih Dahulu:** Sebelum menulis `PRD.md`, ajukan **3–5 pertanyaan paling kritis** untuk menutup celah ambiguitas (tujuan, pengguna target, batasan ruang lingkup, atau kriteria sukses).
   - Beri nomor pada pertanyaan (`1, 2, 3...`) dan sediakan opsi huruf (`A, B, C, D`) agar pengguna bisa menjawab cepat (contoh: `1A, 2C, 3B`).
   - Jangan menanyakan hal yang sudah jelas dari prompt awal atau struktur kode.
2. **Tulis & Simpan PRD:** Setelah pengguna menjawab, susun dokumen lengkap mengikuti seluruh 9 bagian di `PRD.md`, lalu simpan salinannya ke `tasks/prd-[nama-fitur].md`.
3. **Jeda Validasi PRD:** Jangan langsung menulis kode. Minta konfirmasi pengguna bahwa `PRD.md` sudah sesuai.

## Tahap 2: Pemecahan Task Dua Fase (`generate-tasks` Protocol)
1. **Fase 2A — Generate Parent Tasks:**
   - Analisis `PRD.md` dan peta file dari `audit-codebase`.
   - Buat daftar tugas tingkat tinggi (*Parent Tasks*) di `tasks/tasks-[nama-fitur].md`, diawali dengan `0.0 Setup / Verifikasi Branch & Environment`, diikuti `1.0`, `2.0`, dst. sesuai urutan dependensi.
   - **BERHENTI & TUNGGU KONFIRMASI:** Tampilkan daftar Parent Tasks dan tanyakan: *"Parent tasks sudah siap. Ketik 'Go' untuk memecahnya menjadi sub-tasks detail."*
2. **Fase 2B — Generate Sub-Tasks & Relevant Files:**
   - Setelah pengguna membalas **"Go"**, pecah setiap Parent Task menjadi sub-task teknis yang kecil dan terukur (`1.1`, `1.2`, dst.).
   - Tambahkan bagian `## Relevant Files` (daftar file kode dan file test yang akan dibuat/diubah) serta `### Notes` di bagian atas `tasks/tasks-[nama-fitur].md`.

## Tahap 3: Eksekusi Bertahap & Incremental Check-Off
1. **Satu Sub-Task per Siklus:** Kerjakan hanya **1 sub-task** aktif pada satu waktu. Jangan melompat ke sub-task berikutnya sebelum sub-task saat ini selesai dan terverifikasi.
2. **Update Checklist Real-Time:** Segera setelah menyelesaikan 1 sub-task, ubah tanda `- [ ]` menjadi `- [x]` di dalam `tasks/tasks-[nama-fitur].md` (jangan menunggu seluruh parent task selesai).
3. **Tinjauan Berkala:** Laporkan ringkasan perubahan file pada sub-task tersebut dan minta izin untuk lanjut ke sub-task berikutnya (kecuali pengguna menginstruksikan mode jalan terus untuk satu parent task).

## Tahap 4: Verifikasi Akhir & Anti-Regresi
- Jalankan perintah *lint*, *typecheck*, dan *test* yang tercantum di `AGENTS.md`.
- Pastikan seluruh kriteria di bagian *Success Metrics & Acceptance Criteria* pada `PRD.md` telah terpenuhi tanpa menyentuh bagian *Non-Goals*.
