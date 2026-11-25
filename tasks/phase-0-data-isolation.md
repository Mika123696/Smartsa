# Rencana Kerja Fase 0: Pembersihan Data Mock/Corrupt & Isolasi Data Kelas

### Notes & Aturan Pengamanan
- **Eksekusi Bertahap:** Dikerjakan berurutan per sub-fase (`0.1` → `0.2` → `0.3` → `0.4`).
- **Gerbang Verifikasi Wajib:** Di akhir setiap sub-fase, wajib menjalankan `npm run lint` dan `npm test -- --run` dengan hasil **100% PASS** sebelum lanjut ke sub-fase berikutnya.
- **Proteksi Fitur Existing:** Handler `/api/ai` di `api/index.js` berstatus *frozen/read-only*. Pola keamanan di `tests/security.audit.test.js` (zero `correctIndex` di `src/`, zero `window.alert`/`window.confirm`/`dangerouslySetInnerHTML`, serta rule `match /exam_keys/{classId} { allow read, write: if false; }`) harus tetap 100% terpenuhi.
- **Proteksi Database Live:** Skrip `scripts/cleanup-corrupt-data.mjs` wajib menggunakan mode `--dry-run` sebagai default, membutuhkan `--execute` untuk menghapus, **dilarang menyentuh koleksi `users`**, dan tidak boleh dijalankan ke database live tanpa konfirmasi eksplisit pengguna.

---

## 1. Hasil Verifikasi Kesiapan CRUD Dosen (Pre-Execution Audit)

Sebelum menghapus seluruh data fallback/hardcoded, berikut status kesiapan UI & service CRUD dosen saat ini:

| Fitur / Entitas | Status Saat Ini | Bukti Kode Saat Ini | Celah yang Ditemukan (Risiko Empty State Buntu) | Aksi di Fase 0 |
| :--- | :--- | :--- | :--- | :--- |
| **Buat & Edit Metadata Kelas** | Parsial (Create saja) | `ClassesView.jsx:160-194, 495-590` (`createClassInFirestore`) | Tidak ada input `day`, `time`, atau `code` opsional saat membuat kelas; tidak ada form edit info kelas (`name`, `description`, `day`, `time`, `isPublic`) oleh dosen pengampu; `ClassesView` belum menyinkronkan kelas baru ke state parent `App.jsx`. | Lengkapi input form buat kelas + tambah fungsi edit info kelas oleh dosen pemilik (`0.1`). |
| **Kelola Pertemuan (`meetings`)** | Parsial (Edit & Lock/Unlock saja) | `ClassDetailView.jsx:1033-1097` (`updateClassMeetingsInFirestore`) | **TIDAK ADA tombol/form Tambah Pertemuan maupun Hapus Pertemuan.** Jika kelas baru lahir dengan `meetings: []`, dosen akan buntu total dan tidak bisa menambah pertemuan pertama. | Tambah CRUD **Tambah Pertemuan** & **Hapus Pertemuan** di tab `SILABUS & KELOLA` (`0.1`). |
| **Materi Bacaan (Delta JSON / Teks)** | **Tidak Ada** | `ClassDetailView.jsx:1784-1787`, `DeltaContentRenderer.jsx:18-56` | Hanya merender `selectedMeeting?.deltaContent || classData?.deltaContent` dengan fallback `DEFAULT_SAMPLE_DELTA`. **Tidak ada editor/form** bagi dosen untuk mengisi teks/Delta materi per pertemuan. | Tambah form editor materi teks/Delta JSON per pertemuan untuk dosen di tab `READING` (`0.2`). |
| **Video Pembelajaran (`videoUrl`)** | **Tidak Ada** | `ClassDetailView.jsx:788, 1838-1911` | Hanya membaca `classData?.videoUrl` (bukan per pertemuan) dan fallback ke `ForBiggerBlazes.mp4`. **Tidak ada form** bagi dosen untuk menyimpan URL YouTube/Vimeo/MP4 per pertemuan. | Tambah form input/simpan `videoUrl` per pertemuan (YouTube/Vimeo/Cloudinary/MP4) di tab `VIDEO CDN` (`0.2`). |
| **Manual Book PDF (`pdfUrl`)** | **Tidak Ada** | `ClassDetailView.jsx:787, 1949-2013` | Hanya membaca `classData?.pdfUrl` (bukan per pertemuan) dan fallback ke `.txt` sintetis. **Tidak ada form** unggah/tautan PDF Manual Book per pertemuan untuk dosen. | Tambah form input/unggah `pdfUrl` (Cloudinary document atau URL PDF) per pertemuan di tab `MANUAL BOOK` (`0.2`). |
| **Tugas (`assignments`) & Nilai** | **Sudah Ada** | `TeacherDashboard.jsx:221-255, 525-626`; `ClassDetailView.jsx:965-1006, 2661-2751` | Form terbitkan tugas & grading sudah lengkap (`createAssignmentInFirestore`, `gradeSubmissionInFirestore`), hanya dropdown `Pertemuan` di `ClassDetailView` akan kosong jika `meetingsList` masih `[]`. | Tampilkan guard/panduan *"Buat pertemuan terlebih dahulu"* atau input `1..32` jika belum ada pertemuan (`0.1` / `0.2`). |
| **Presensi QR (`attendance`)** | **Sudah Ada** | `TeacherDashboard.jsx:116-181`; `ClassDetailView.jsx:1099-1152` | Sudah lengkap (`openAttendanceSession` / `closeAttendanceSession`). Jika pertemuan belum ada, pilihannya tetap perlu mengikuti daftar pertemuan yang ada / `1..16`. | Gunakan pertemuan yang tersedia di kelas (fallback input angka pertemuan `1..32` jika perlu) (`0.1`). |
| **Soal & Kunci Pretest/Post-test** | **Tidak Ada** | `ClassDetailView.jsx:65-110, 2907-3091`; `api/index.js:334-501` | Soal masih hardcoded di `EXAM_QUESTIONS` dan tab dosen hanya *read-only* kunci `instructor_keys`. **Belum ada UI & endpoint** untuk dosen membuat/mengedit soal + kunci per `(classId, meetingNo, examType)`. | Tambah form CRUD Soal + Kunci untuk dosen di tab `KUNCI & STATISTIK` + handler `action: 'save_exam'` di `POST /api/grade` (`0.2`). |

---

## 2. Keputusan Skema Final Evaluasi & Soal

Untuk menyelaraskan ketidaksesuaian `PRD.md` (`answer_keys/{testId}/items`) dengan implementasi aktual (`exam_keys/{classId}`) serta mengisolasi ujian per `(classId, meetingNo, examType)`, ditetapkan skema final tunggal sebagai berikut:

1. **Koleksi Soal Tanpa Kunci — `exams/{classId}_m{meetingNo}_{examType}`**
   - **Field:**
     ```json
     {
       "examId": "cls_123_m1_pretest",
       "classId": "cls_123",
       "meetingNo": 1,
       "examType": "pretest",
       "title": "Pretest Pertemuan 01",
       "durationMinutes": 15,
       "questions": [
         {
           "id": "q1",
           "question": "Teks pertanyaan...",
           "options": ["Opsi A", "Opsi B", "Opsi C", "Opsi D"]
         }
       ],
       "updatedBy": "<lecturerUid>",
       "updatedAt": "<serverTimestamp>"
     }
     ```
   - **Keamanan:** **DILARANG keras** menyertakan field kunci jawaban (`correctIndex`, `answerKey`, dll.) di koleksi `exams`.
   - **Akses Firestore Rules:** `read` diizinkan hanya untuk `isAdmin()`, dosen pemilik kelas (`isClassLecturer(resource.data.classId)`), atau mahasiswa terdaftar (`isClassMember(resource.data.classId, request.auth.uid)`). `write` di klien diset `false` — seluruh penulisan soal + kunci dilakukan secara atomik oleh server melalui `POST /api/grade` (`action: 'save_exam'`).

2. **Koleksi Kunci Jawaban Server-Only — `exam_keys/{classId}`**
   - **Struktur Dokumen:**
     ```json
     {
       "classId": "cls_123",
       "meetings": {
         "1": {
           "pretest": { "q1": 1, "q2": 0 },
           "posttest": { "q1": 2, "q2": 3 }
         }
       },
       "updatedBy": "<lecturerUid>",
       "updatedAt": "<serverTimestamp>"
     }
     ```
   - **Keamanan:** `match /exam_keys/{classId} { allow read, write: if false; }` tetap dipertahankan persis di `firestore.rules` (kompatibel 100% dengan `tests/security.audit.test.js`).
   - **Logika Lookup di `api/index.js` (`handleGrade`):**
     - Prioritas 1: `keyData?.meetings?.[String(safeMeetingNo)]?.[safeExamType]`.
     - Prioritas 2 (kompatibilitas dokumen seed existing seperti `subj_pbo`): `keyData?.[safeExamType] || keyData?.answers || keyData?.questions`.
     - **Hapus fallback `SERVER_EXAM_KEYS.default`:** Jika dokumen `exam_keys/{safeClassId}` tidak ditemukan atau tidak memiliki kunci untuk `(meetingNo, examType)` tersebut:
       - Pada `action: 'instructor_keys'`: kembalikan `200` dengan `answerKey: {}`, `isConfigured: false`.
       - Pada `action: 'start'` / `'submit'`: kembalikan `404` (`code: 'EXAM_NOT_CONFIGURED'`, pesan bahwa evaluasi belum dibuat dosen), bukan menilai dengan kunci RPL default.

3. **Koleksi Rekaman Attempt — `exam_attempts/{classId}_m{meetingNo}_{examType}_{uid}`**
   - Tetap dikelola 100% server-side (`allow create, update, delete: if false;` di `firestore.rules`) melalui `POST /api/grade` (`action: 'start'` dan `'submit'`).
   - Validasi tambahan di `/api/grade`: pada `start`/`submit`, pastikan pemanggil adalah `admin`, `lecturer` pemilik kelas, atau terdaftar di `class_members/{safeClassId}_{uid}` (untuk mahasiswa).
   - Hapus fungsi legacy orphan `fetchClassExamAttempt` (`${classId}_${uid}`) di `lmsFirestoreService.js`.

---

## 3. Matriks Sinkronisasi Ketat Query Client ↔ `firestore.rules` ↔ `firestore.indexes.json`

Setiap pengetatan rule wajib dipasangkan dengan query client yang memfilter atribut yang sama agar operasi `list` / `onSnapshot` tidak pernah gagal dengan `permission-denied`:

| Koleksi | Aturan `firestore.rules` (Target Fase 0.4) | Query Client yang Diizinkan & Cocok | Composite Index (`firestore.indexes.json`) |
| :--- | :--- | :--- | :--- |
| **`users/{uid}`** | `read`: `auth.uid == uid \|\| isAdmin()` | User: `doc(db, 'users', uid)`. Admin (`AdminDashboard`): `collection(db, 'users')` | Tidak butuh composite index |
| **`classes/{classId}`** | `read`: `isAdmin() \|\| (isSignedIn() && (resource.data.lecturerId == auth.uid \|\| isClassMember(classId, auth.uid))) \|\| resource.data.isPublic == true`<br>`create`: `isAdmin() \|\| (isLecturer() && req.lecturerId == auth.uid)`<br>`update`: `isAdmin() \|\| (isLecturer() && res.lecturerId == auth.uid && req.lecturerId == res.lecturerId)`<br>`delete`: `isAdmin() \|\| (isLecturer() && res.lecturerId == auth.uid)` | Publik: `where('isPublic', '==', true)`<br>Dosen: `where('lecturerId', '==', uid)`<br>Mahasiswa: ambil `classIds` dari `class_members` lalu `getDoc(doc(db, 'classes', id))` / `where(documentId(), 'in', chunk)`<br>Admin: `collection(db, 'classes')` | Tidak butuh composite index baru |
| **`class_members/{classId}_{uid}`** | `read`: `isSignedIn() && (res.uid == auth.uid \|\| isAdmin() \|\| isClassLecturer(res.classId))`<br>`write`: `false` (via `/api/join-class`) | User: `where('uid', '==', uid), orderBy('joinedAt', 'desc')`<br>Dosen per kelas: `where('classId', '==', classId)` | `(uid ASC, joinedAt DESC)` *(existing)* |
| **`assignments/{assignmentId}`** | `read`: `isAdmin() \|\| (isSignedIn() && res.classId is string && (isClassLecturer(res.classId) \|\| isClassMember(res.classId, auth.uid)))`<br>`create`: `isAdmin() \|\| (isLecturer() && req.classId is string && isClassLecturer(req.classId))`<br>`update, delete`: `isAdmin() \|\| (isLecturer() && res.classId is string && isClassLecturer(res.classId) && req.classId == res.classId)` | Detail kelas: `where('classId', '==', classId)`<br>MaterialsTab: chunk `where('classId', 'in', classIdsChunk)` *(skip query jika `classIds` kosong)* | Pertahankan `(classId ASC, deadline ASC)` atau pakai `orderBy('deadline', 'asc')` saat single-class query |
| **`submissions/{assignmentId}_{uid}`** | `read`: `isAdmin() \|\| (isSignedIn() && (res.uid == auth.uid \|\| (isLecturer() && res.classId is string && isClassLecturer(res.classId))))`<br>`create`: `uid == auth.uid`, `req.classId is string`, `isClassMember(req.classId, auth.uid)`, no `grade/score/feedback/gradedBy`<br>`update`: student owner (tanpa grade fields & `classId`) / `isClassLecturer(res.classId)` / `isAdmin()` | Mahasiswa: `where('uid', '==', uid)` (atau `where('classId', '==', classId), where('uid', '==', uid)`)<br>Dosen Detail Kelas: `where('classId', '==', classId)`<br>Dosen Hub (`TeacherDashboard`): chunk `where('classId', 'in', ownedClassIdsChunk)` *(bukan `collection(db, 'submissions')` global!)* | Tambah `(classId ASC, submittedAt DESC)` & `(classId ASC, uid ASC)`; hapus `(assignmentId, submittedAt)` yang tidak terpakai |
| **`attendance/{classId}_m{meetingNo}_{uid}`** | `read`: `isAdmin() \|\| (isSignedIn() && (res.uid == auth.uid \|\| (isLecturer() && res.classId is string && isClassLecturer(res.classId))))`<br>`create`: `uid == auth.uid`, `isClassMember(req.classId, auth.uid)`<br>`update, delete`: `isAdmin() \|\| (isLecturer() && res.classId is string && isClassLecturer(res.classId))` | Mahasiswa per kelas: `where('classId', '==', classId), where('uid', '==', uid), orderBy('meetingNo', 'asc')`<br>Mahasiswa summary: `where('uid', '==', uid)` (hanya hitung kelas aktif)<br>Dosen kelas: `where('classId', '==', classId)` | `(classId ASC, uid ASC, meetingNo ASC)` *(existing)* |
| **`exams/{classId}_m{meetingNo}_{examType}`** | `read`: `isAdmin() \|\| (isSignedIn() && res.classId is string && (isClassLecturer(res.classId) \|\| isClassMember(res.classId, auth.uid)))`<br>`write`: `false` (via `/api/grade` `save_exam`) | Detail kelas: `getDoc(doc(db, 'exams', `${classId}_m${meetingNo}_${examType}`))` atau `where('classId', '==', classId)` | Tidak butuh composite index (lookup by deterministic ID) |
| **`exam_keys/{classId}`** | `read, write: if false;` *(100% server-only)* | Hanya dibaca/ditulis oleh Admin SDK di `api/index.js` & CLI scripts | Tidak ada |
| **`exam_attempts/{classId}_m{meetingNo}_{examType}_{uid}`** | `read`: `isAdmin() \|\| (isSignedIn() && (res.uid == auth.uid \|\| (isLecturer() && res.classId is string && isClassLecturer(res.classId))))`<br>`write`: `false` (via `/api/grade`) | Mahasiswa: `where('uid', '==', uid)` / `where('classId', '==', classId), where('uid', '==', uid)`<br>Dosen kelas: `where('classId', '==', classId)` | Tambah `(classId ASC, uid ASC)`; sesuaikan `(classId ASC, submittedAt DESC)` |
| **`discussions/{discussionId}`** | `read`: `isAdmin() \|\| (isSignedIn() && res.classId is string && (isClassLecturer(res.classId) \|\| isClassMember(res.classId, auth.uid)))`<br>`create`: `authorUid == auth.uid`, `isVerifiedAnswer == false`, `req.classId is string`, member/lecturer/admin<br>`update, delete`: member/author/lecturer pengampu kelas / `isAdmin()` | Embedded: `where('classId', '==', propClassId)`<br>Standalone `DiscussionTab`: filter per `selectedClassId` milik/diikuti user (`where('classId', '==', selectedClassId)`) atau `where('classId', 'in', userClassIdsChunk)` *(skip jika 0 kelas!)* | `(classId ASC, createdAt DESC)` *(existing — tambahkan `orderBy` atau pertahankan sort client)* |
| **`learning_progress/{classId}_m{meetingNo}_{uid}`** | `read`: `isAdmin() \|\| (isSignedIn() && (res.uid == auth.uid \|\| (isLecturer() && res.classId is string && isClassLecturer(res.classId))))`<br>`create`: `uid == auth.uid`, `isClassMember(req.classId, auth.uid)`<br>`update`: `uid == auth.uid` (immutable `classId`, `meetingNo`) | `fetchUserLearningProgress`: `where('uid', '==', uid)`<br>`fetchLearningProgressByClass`: `where('classId', '==', classId), where('uid', '==', uid)` | Tambah `(classId ASC, uid ASC)` di `firestore.indexes.json` |

---

## 4. Spesifikasi Keamanan Skrip Pembersihan (`scripts/cleanup-corrupt-data.mjs`)

- **Default Mode:** `--dry-run` (hanya memindai dan mencetak laporan ID dokumen yang akan dihapus tanpa melakukan operasi `delete()` apa pun).
- **Eksekusi Nyata:** Hanya berjalan jika diberi flag eksplisit `--execute` (atau `--execute --include-seeded` bila admin juga ingin menghapus data seed awal `subj_*` / `asg_01..04`).
- **Hard Guard Koleksi `users`:** Koleksi `users` secara eksplisit dikecualikan dan **tidak boleh disentuh/dihapus dalam kondisi apa pun**.
- **Target Scan Aman (Koleksi Non-`users`):**
  1. `classes`: dokumen tanpa `lecturerId` valid (`demo_lecturer`), atau yang memiliki `meetings` dengan pola template auto-seed lama (`Modul Pembelajaran 01` s.d. `16`) dan ditandai korup.
  2. `class_members`, `assignments`, `submissions`, `attendance`, `discussions`, `exam_attempts`, `exams`, `exam_keys`, `learning_progress`: dokumen tanpa `classId` atau yang `classId`-nya **orphan** (tidak ada dokumen induknya di koleksi `classes`).
  3. `exam_attempts`: dokumen berpola ID lama `${classId}_{uid}` (tanpa `_m{meetingNo}_{examType}`).

---

## 5. Rencana Kerja Bertahap (Sub-Fase 0.1 → 0.4)

### Sub-Fase 0.1 — Clean Class Creation & CRUD Pertemuan Dosen
- [x] **0.1.1** Perbarui `createClassInFirestore` & `normalizeClassDoc` di `src/services/lmsFirestoreService.js`:
  - Hapus pemanggilan `buildFallbackMeetings` dan hardcode `materialsCount: 5`.
  - Kelas baru dibuat kosong: `meetings: []`, `meetingsCount: 0`, `materialsCount: 0`, `enrolledCount: 0`, `description: description.trim()` (boleh kosong), `coverImage: ''`, `videoUrl: ''`, `pdfUrl: ''`.
  - Pastikan `normalizeClassDoc` mengembalikan `meetings: Array.isArray(data.meetings) ? data.meetings : []` tanpa menyuntikkan 16 pertemuan dummy, serta `materialsCount: Number(data.materialsCount || 0)`.
- [x] **0.1.2** Tambah helper CRUD kelas & pertemuan di `src/services/lmsFirestoreService.js` dan lengkapi form di `src/components/features/ClassesView.jsx`:
  - Tambahkan input opsional `Hari` (`day`) dan `Jam` (`time`) pada modal Buat Kelas di `ClassesView.jsx` (tetap valid bila dikosongkan).
  - Sinkronkan hasil pembuatan kelas baru ke state parent `App.jsx` via prop callback `onClassCreated` agar dashboard/detail langsung sinkron.
  - Tambahkan fungsi `updateClassDetailsInFirestore(classId, updates)` untuk edit info kelas oleh dosen pengampu.
- [x] **0.1.3** Hapus `buildFallbackMeetingsList` di `src/components/features/ClassDetailView.jsx` dan bangun UI **Tambah & Hapus Pertemuan** bagi dosen:
  - Jika `meetingsList.length === 0`: tampilkan *empty state* bersih (untuk mahasiswa: pesan belum ada pertemuan; untuk dosen: form/tombol *"+ Tambah Pertemuan Pertama"*).
  - Pada tab `SILABUS & KELOLA` (khusus dosen/admin), tambahkan form *"Tambah Pertemuan Baru"* (`order` otomatis `max(order) + 1`, mulai dari 1, `title`, `date`, `status` default `open`) dan tombol *"Hapus"* (pakai `AccessibleDialog`, zero `window.confirm`) yang memperbarui `meetings` & `meetingsCount` via `updateClassMeetingsInFirestore` tanpa re-numbering pertemuan tersisa.
  - Perbarui dropdown `Pertemuan` di form tugas & presensi `ClassDetailView.jsx` agar aman ketika `meetingsList` kosong atau ada nomor pertemuan yang terhapus.
- [x] **0.1.4** Perbarui unit test di `tests/frontend.security.test.jsx` bila ada asersi yang bergantung pada auto-generated fallback meetings, tambahkan test pembuatan kelas kosong & CRUD pertemuan dosen (`max(order) + 1` & sync `meetingsCount`), lalu verifikasi `npm run lint` dan `npm test -- --run` **100% PASS**.

### Sub-Fase 0.2 — Hapus Fallback Konten Dummy & Tambah CRUD Materi + Evaluasi Dosen
- [x] **0.2.1** Hapus fallback materi dummy di `src/components/common/DeltaContentRenderer.jsx` dan tambah **CRUD Materi Bacaan per Pertemuan**:
  - Hapus `DEFAULT_SAMPLE_DELTA` dari jalur fallback `DeltaContentRenderer.jsx` (`L161`). Jika `delta` kosong dan `fallbackText` kosong, render empty state eksplisit.
  - Di `ClassDetailView.jsx` tab `READING / DELTA JSON`, baca materi secara terisolasi per pertemuan (`selectedMeeting?.deltaContent` / `selectedMeeting?.contentText`, tanpa bocor dari kelas lain).
  - Untuk dosen/admin (saat ada pertemuan terpilih), sediakan panel editor ringan *"Kelola Materi Pertemuan"* untuk menyimpan konten teks terstruktur (dikonversi menjadi Delta JSON `{ ops: [...] }` yang aman) ke dokumen pertemuan di Firestore.
- [x] **0.2.2** Hapus video & manual book fallback di `src/components/features/ClassDetailView.jsx` dan tambah **CRUD Video URL & PDF per Pertemuan**:
  - Hapus fallback video `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4` (`L1881`) dan file virtual `Buku_Panduan_Praktikum_*.txt` (`L794-814, 2001-2011`).
  - Baca `videoUrl` dan `pdfUrl` dari `selectedMeeting?.videoUrl` / `selectedMeeting?.pdfUrl` (fallback hanya ke `classData?.videoUrl` / `classData?.pdfUrl` jika memang diisi dosen, bukan dummy). Jika kosong, tampilkan *empty state* jujur.
  - Sediakan form dosen di tab `VIDEO CDN` (input URL YouTube/Vimeo/MP4 valid) dan tab `MANUAL BOOK` (unggah PDF via `uploadMediaFile(..., 'document')` atau input URL PDF eksternal `https://`) untuk menyimpan URL ke pertemuan aktif di Firestore dan memperbarui `hasVideo` / `hasPdf` + `materialsCount`.
- [x] **0.2.3** Implementasi Skema Evaluasi Final (Bank Soal `exams` + Kunci Server-Only `exam_keys`) di `api/index.js`, `lmsFirestoreService.js`, & `ClassDetailView.jsx`:
  - Di `api/index.js` (`handleGrade`):
    - Tambah `action: 'save_exam'` (verifikasi role `lecturer` pemilik `classes/{classId}.lecturerId == decodedToken.uid` atau `admin`) yang menyimpan daftar soal tanpa kunci ke `exams/{safeClassId}_m{safeMeetingNo}_{safeExamType}` dan kunci jawaban ke `exam_keys/{safeClassId}` (`meetings[meetingNo][examType]`) secara server-side.
    - Perbarui `action: 'instructor_keys'`, `'start'`, dan `'submit'` untuk membaca kunci per `(safeClassId, safeMeetingNo, safeExamType)` dari `meetings[meetingNo][examType]` (fallback hanya ke `keyData?.[safeExamType]` jika dokumen legacy ada), **hapus fallback `SERVER_EXAM_KEYS.default`** untuk kelas baru, dan validasi keanggotaan `class_members` pada `start`/`submit`.
  - Di `src/services/lmsFirestoreService.js`:
    - Tambah `fetchMeetingExam(classId, meetingNo, examType)` (membaca `exams/{classId}_m{meetingNo}_{examType}`) dan `saveMeetingExamByInstructor(...)` (memanggil `POST /api/grade` `action: 'save_exam'`).
    - Hapus dev fallback `{ q1: 1, q2: 2, q3: 1, q4: 1 }` di `fetchInstructorAnswerKey` (`L733-738`) atau batasi hanya saat `DEV` dengan flag eksplisit bila backend `/api/grade` tidak aktif.
  - Di `src/components/features/ClassDetailView.jsx`:
    - Hapus konstanta global `EXAM_QUESTIONS` (`L65-110`) dan `computeLocalDevScore` dummy keys.
    - Tab `PRETEST & EVALUASI` (mahasiswa): muat soal dari `exams/{classId}_m{meetingNo}_{examType}`; jika belum dibuat dosen, tampilkan *empty state* *"Evaluasi untuk pertemuan ini belum dibuat oleh dosen"* dan nonaktifkan tombol mulai ujian.
    - Tab `KUNCI & STATISTIK` (dosen/admin): sediakan form CRUD *"Buat / Kelola Soal & Kunci Evaluasi"* per pertemuan & tipe (`pretest` / `posttest`) sehingga dosen bisa menambah pertanyaan, 4 opsi jawaban, dan memilih kunci jawaban referensi (disimpan ke server via `/api/grade` tanpa pernah memakai identifier `correctIndex` di `src/`).
- [x] **0.2.4** Tambahkan unit test API (`tests/api.dispatcher.test.js`) untuk `save_exam`, isolasi kunci per `(classId, meetingNo, examType)`, dan penolakan `404 EXAM_NOT_CONFIGURED` pada kelas kosong; perbarui test `tests/frontend.security.test.jsx` agar memakai prop/mock soal dinamis; jalankan `npm run lint` dan `npm test -- --run` (**100% PASS**).

### Sub-Fase 0.3 — Putus Fallback `mockData.js`, Nilai Statis Dashboard, & Hardcoded `'subj_pbo'`
- [x] **0.3.1** Putus fallback `DEMO_CLASSES` di layanan & halaman katalog/dashboard:
  - `src/services/lmsFirestoreService.js`: Ubah `fetchPublicClasses()` (`L92-118`) agar mengembalikan `classes: [], isEmpty: true` saat Firestore kosong/error (bukan menyuntikkan `DEMO_CLASSES`). Ubah `fetchClasses()` saat `!auth?.currentUser` atau `!db` agar tidak membanjiri UI dengan `DEMO_CLASSES` jika mode terautentikasi/online.
  - `LandingPage.jsx`, `PublicCatalog.jsx`, `GeneralDashboard.jsx`: Inisialisasi state dengan `[]` + indikator loading / empty state jujur (*"Belum ada kelas publik tersedia"*), hapus import `DEMO_CLASSES` dan angka metrik palsu (`4`, `8.5h`, `20 / 20` di `GeneralDashboard.jsx`).
- [x] **0.3.2** Bersihkan hardcoded fallback di `StudentDashboard.jsx`, `TeacherDashboard.jsx`, `MaterialsTab.jsx`, `AdminDashboard.jsx`, `ClassesView.jsx`, & `AIAssistantView.jsx`:
  - `StudentDashboard.jsx`: Hapus `|| 18` pada Total SKS (`L387`), `Ruang Lab Komputer 03` (`L529`), serta jadwal/kartu ujian hardcoded UTS/UAS (`L654-723`) — ganti dengan status dinamis dari `classes` & `examAttempts` user atau *empty state*.
  - `TeacherDashboard.jsx`: Hapus `DEMO_SUBMISSIONS_FALLBACK` (`L32-42, L89`).
  - `MaterialsTab.jsx`: Hapus `DEMO_ASSIGNMENTS_FALLBACK` (`L35-70, L105`) dan dropdown 16 pertemuan statis jika tidak relevan.
  - `AdminDashboard.jsx`: Hapus `DEMO_AUDIT_LOGS` (`L13, L62`), `DEMO_VERIFICATION_QUEUE` (`L31-50, L61`), `useState(6)` (`L58`), dan fallback `1420` (`L344`) saat terautentikasi; tampilkan *empty state* jujur (*"Belum ada log audit server"* / `0`).
  - `ClassesView.jsx`: Hapus tips kode hardcoded `PBO101` & `BD202` (`L462, L466`).
  - `AIAssistantView.jsx`: Ganti `context` hardcoded RPL (`L66`) menjadi konteks dinamis atau umum Smartsa LMS.
- [x] **0.3.3** Hapus seluruh fallback `'subj_pbo'` & `TOPIC_TO_CLASS_ID` statis:
  - `App.jsx` (`L308, L371`): Hapus `normalizeClassDoc('subj_pbo', {})` — jika kelas tidak ditemukan di view `detail`, tampilkan empty state atau arahkan kembali ke daftar kelas.
  - `lmsFirestoreService.js` (`L702, L771, L818`), `ClassDetailView.jsx` (`L269, L291, L335-336, L519, L721, L980, L3097`), `DiscussionTab.jsx` (`L28-35, L62, L333-345`), `aiService.js` (`L51`): Wajib memakai `classId` valid (tolak operasi jika kosong) dan muat pilihan mata kuliah di `DiscussionTab` standalone secara dinamis dari kelas milik/diikuti user.
- [x] **0.3.4** Jalankan `npm run lint` dan `npm test -- --run` (**100% PASS**).

### Sub-Fase 0.4 — Isolasi Query, State/Storage Hygiene, Rules/Indexes, & Safe Cleanup Script
- [x] **0.4.1** Tegakkan isolasi `classId` & kepemilikan di seluruh query Firestore client (`lmsFirestoreService.js`, `attendanceService.js`, `MaterialsTab.jsx`, `TeacherDashboard.jsx`, `ScheduleTab.jsx`, `StudentDashboard.jsx`, `DiscussionTab.jsx`):
  - `fetchClasses` dipisah menjadi query role-aware (`fetchClassesForUser({ uid, role })`):
    - `admin`: semua kelas.
    - `lecturer`: `where('lecturerId', '==', uid)`.
    - `student`: ambil `classIds` dari `class_members` (`where('uid', '==', uid)`) lalu fetch dokumen `classes/{id}` terkait saja (katalog publik tetap terpisah via `fetchPublicClasses()` hanya untuk modal/halaman katalog gabung kelas).
  - `MaterialsTab.jsx`: Hanya muat `classes` milik/diikuti user dan `assignments` dengan filter `where('classId', 'in', chunk)` (return `[]` jika user belum mengikuti kelas).
  - `TeacherDashboard.jsx`: Ganti `fetchAllSubmissionsForGrading()` dengan `fetchSubmissionsForLecturerClasses(ownedClassIds)` memakai filter `where('classId', 'in', chunk)`.
  - `DiscussionTab.jsx` standalone: Hanya subscribe diskusi untuk kelas yang diikuti/diampu user (`where('classId', '==', selectedClassId)` atau `in` chunk); jika 0 kelas, jangan jalankan query.
  - Hapus fungsi orphan `fetchClassExamAttempt` (`${classId}_${uid}`) di `lmsFirestoreService.js:1028-1040`.
- [x] **0.4.2** Perbaiki kebocoran State React & `sessionStorage`:
  - `App.jsx`: Reset `classes`, `joinedClassIds`, `membershipsLoaded`, `selectedSubject`, dan `requestedClassModal` saat logout atau pergantian `currentUser?.uid`; panggil `setLocalExamSession({ active: false })` pada `handleConfirmLeaveExam` dan `AuthContext.logout()`.
  - `ClassDetailView.jsx`: Reset seluruh state pertemuan/tab (`activeTab`, `videoActivated`, `downloadSuccess`, `progressFeedback`, `examActive`, `examFinished`, `examScore`, `examError`, `selectedAnswers`, `taskFeedback`, `createTaskNotice`, `attFeedback`, `gradingNotice`, `editingMeetingId`) secara tepat saat `classData?.id` atau `selectedMeeting?.order` berubah; tambahkan `mounted`/request-ID guard di `loadInstructorAttendance`, `loadInstructorGrading`, `loadInstructorEvalAnalytics`, dan `loadClassExtras`.
  - `DiscussionTab.jsx`: Kosongkan `discussions` saat `currentKey` berubah dan reset `questionInput`, `replyInputs`, `activeReplyId`, `errorMsg`, `deleteConfirm`, serta sinkronkan `postMeetingNo` saat `propClassId` / `propMeetingNo` berubah.
  - `MaterialsTab.jsx`, `ScheduleTab.jsx`, `ClassesView.jsx`, `TeacherDashboard.jsx`: Tambahkan `mounted` guard pada async effect dan reset modal/feedback state saat `currentUser?.uid` berubah.
- [x] **0.4.3** Sinkronkan `firestore.rules` dan `firestore.indexes.json`:
  - Perbarui `firestore.rules` sesuai Matriks §3 (batasi `classes` update ke pemilik/admin, batasi read/write `assignments`, `submissions`, `attendance`, `exams`, `exam_attempts`, `discussions`, `learning_progress` ke `isClassLecturer` / `isClassMember` / `isAdmin()`, pertahankan `match /exam_keys/{classId} { allow read, write: if false; }`).
  - Perbarui `firestore.indexes.json` agar 100% sinkron dengan seluruh query multi-field (`submissions (classId, submittedAt)` & `(classId, uid)`, `exam_attempts (classId, uid)` & `(classId, submittedAt)`, `learning_progress (classId, uid)`, `attendance (classId, uid, meetingNo)`, `class_members (uid, joinedAt)`, `assignments (classId, deadline)`, `discussions (classId, createdAt)`).
- [x] **0.4.4** Buat skrip pembersihan aman `scripts/cleanup-corrupt-data.mjs` (default `--dry-run`, wajib `--execute` untuk menghapus, **anti-hapus koleksi `users`**) — **JANGAN jalankan `--execute` ke database live tanpa konfirmasi eksplisit user**.
- [x] **0.4.5** Tambahkan test verifikasi isolasi `classId` & state reset antar kelas/pertemuan di `tests/frontend.security.test.jsx` serta rule check di `tests/security.audit.test.js`; jalankan `npm run lint`, `npm test -- --run`, dan `npm run build` (**100% PASS**).

---

## 6. Relevant Files (Peta File Terdampak)
- `PRD.md`
- `tasks/phase-0-data-isolation.md`
- `api/index.js`
- `firestore.rules`
- `firestore.indexes.json`
- `scripts/cleanup-corrupt-data.mjs` *(baru)*
- `src/App.jsx`
- `src/context/AuthContext.jsx`
- `src/services/lmsFirestoreService.js`
- `src/services/attendanceService.js`
- `src/services/aiService.js`
- `src/services/mockData.js`
- `src/components/common/DeltaContentRenderer.jsx`
- `src/components/features/ClassesView.jsx`
- `src/components/features/ClassDetailView.jsx`
- `src/components/features/MaterialsTab.jsx`
- `src/components/features/DiscussionTab.jsx`
- `src/components/features/ScheduleTab.jsx`
- `src/components/features/AIAssistantView.jsx`
- `src/components/dashboard/TeacherDashboard.jsx`
- `src/components/dashboard/StudentDashboard.jsx`
- `src/components/dashboard/GeneralDashboard.jsx`
- `src/components/dashboard/AdminDashboard.jsx`
- `src/components/public/LandingPage.jsx`
- `src/components/public/PublicCatalog.jsx`
- `tests/api.dispatcher.test.js`
- `tests/frontend.security.test.jsx`
- `tests/security.audit.test.js`
