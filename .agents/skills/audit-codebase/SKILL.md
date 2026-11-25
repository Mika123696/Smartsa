---
name: audit-codebase
description: Gunakan skill ini SEBELUM melakukan perubahan kode, debugging, refactoring, atau integrasi fitur untuk memetakan struktur proyek, dependensi, dan akar masalah secara read-only.
---

# Audit-First Diagnostic & Architecture Mapping Workflow

## Batasan Mutlak (Strict Mode)
- **100% Read-Only:** DILARANG membuat, mengedit, atau menghapus file apa pun selama skill ini berjalan.
- **Tanpa Asumsi:** Jangan menebak nama file, struktur folder, skema database, atau kontrak API sebelum membaca kode sumber aslinya.
- **Kepatuhan Rahasia:** Lewati file `.env*` dan kredensial privat.

## Fase 1: Pemetaan Struktur & Konfigurasi Proyek
1. Periksa manifest dependensi dan konfigurasi utama (`package.json`, `tsconfig.json`, `pubspec.yaml`, aturan routing, atau konfigurasi backend/database).
2. Identifikasi *tech stack*, pola arsitektur, dan konvensi penamaan yang sedang berlaku di repositori.

## Fase 2: Penelusuran Alur Eksekusi & Akar Masalah
1. Lacak *entry point* yang relevan dengan permintaan pengguna (UI component $\rightarrow$ state management $\rightarrow$ service/API handler $\rightarrow$ database/storage).
2. Jika mengaudit bug atau regresi, temukan titik pasti penyebab kegagalan (*root cause*) beserta baris/file terkait.
3. Identifikasi dependensi silang dan potensi efek samping (*side effects*) jika file tersebut diubah.

## Fase 3: Laporan Audit & Rencana Eksekusi
Sajikan laporan terstruktur kepada pengguna dengan format berikut:
1. **Ringkasan Temuan & Akar Masalah:** Penjelasan padat mengenai kondisi saat ini.
2. **Peta File Terdampak:** Daftar path lengkap file yang perlu dibaca, dibuat, atau dimodifikasi.
3. **Risiko & Dependensi:** Hal yang berpotensi rusak jika tidak ditangani hati-hati.
4. **Rencana Perubahan Bertahap (Step-by-Step):** Urutan langkah perbaikan atau implementasi.

## Fase 4: Mandatory Human Gate
- **BERHENTI** setelah menyajikan laporan audit.
- Minta persetujuan eksplisit dari pengguna sebelum berpindah ke penulisan kode atau mengaktifkan skill `build-feature`.
