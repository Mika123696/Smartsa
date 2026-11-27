import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/assignment_models.dart';
import '../models/attendance_models.dart';
import '../models/discussion_models.dart';
import '../models/exam_models.dart';
import '../models/lms_class.dart';
import '../models/manual_book.dart';
import '../models/user_profile.dart';
import '../utils/attendance_qr_utils.dart';
import '../utils/url_utils.dart';

/// Hasil pemuatan daftar kelas pengguna dari Cloud Firestore.
class UserClassesResult {
  const UserClassesResult({
    required this.classes,
    required this.pendingMemberships,
  });

  final List<LmsClass> classes;
  final List<ClassMembership> pendingMemberships;
}

/// Layanan akses Cloud Firestore yang selaras 1:1 dengan `firestore.rules`
/// dan `firestore.indexes.json`.
class FirestoreService {
  FirestoreService({this._firestore});

  final FirebaseFirestore? _firestore;

  FirebaseFirestore get _db => _firestore ?? FirebaseFirestore.instance;

  /// Fallback read-only profil dari `users/{uid}` bila `/api/bootstrap` gagal.
  Future<UserProfile?> fetchUserProfileFallback({
    required String uid,
    required String email,
    required bool emailVerified,
    String? fallbackDisplayName,
    String? fallbackPhotoUrl,
  }) async {
    try {
      final snap = await _db.collection('users').doc(uid).get();
      if (!snap.exists || snap.data() == null) {
        return null;
      }
      final data = Map<String, dynamic>.from(snap.data()!);
      data.remove('password');
      data['uid'] = uid;
      data['email'] ??= email;
      data['emailVerified'] ??= emailVerified;
      data['displayName'] ??= fallbackDisplayName;
      data['photoURL'] ??= fallbackPhotoUrl;
      return UserProfile.fromJson(
        data,
        mfaRequiredOverride: data['mfaEnabled'] == true,
      );
    } catch (_) {
      return null;
    }
  }

  /// Memuat kelas sesuai peran pengguna (`admin`, `lecturer`, `student`).
  Future<UserClassesResult> fetchClassesForUser({
    required String uid,
    required String role,
  }) async {
    if (uid.trim().isEmpty) {
      return const UserClassesResult(
        classes: <LmsClass>[],
        pendingMemberships: <ClassMembership>[],
      );
    }

    if (role == 'admin') {
      final snap = await _db.collection('classes').get();
      final classes = snap.docs
          .map((doc) => LmsClass.fromMap(doc.id, doc.data()))
          .toList(growable: false);
      return UserClassesResult(
        classes: classes,
        pendingMemberships: const <ClassMembership>[],
      );
    }

    if (role == 'lecturer') {
      final snap = await _db
          .collection('classes')
          .where('lecturerId', isEqualTo: uid)
          .get();
      final classes = snap.docs
          .map((doc) => LmsClass.fromMap(doc.id, doc.data()))
          .toList(growable: false);
      return UserClassesResult(
        classes: classes,
        pendingMemberships: const <ClassMembership>[],
      );
    }

    // Peran mahasiswa/umum: baca keanggotaan via `class_members` lalu chunk
    // `where(FieldPath.documentId, whereIn: ...)` maks 10 per query.
    final memberSnap = await _db
        .collection('class_members')
        .where('uid', isEqualTo: uid)
        .orderBy('joinedAt', descending: true)
        .get();

    final memberships = memberSnap.docs
        .map((doc) => ClassMembership.fromMap(doc.id, doc.data()))
        .toList(growable: false);

    final pendingMemberships = memberships
        .where((m) => m.isPending)
        .toList(growable: false);

    final approvedIds = memberships
        .where((m) => m.isApproved && m.classId.isNotEmpty)
        .map((m) => m.classId)
        .toSet()
        .toList(growable: false);

    if (approvedIds.isEmpty) {
      return UserClassesResult(
        classes: const <LmsClass>[],
        pendingMemberships: pendingMemberships,
      );
    }

    final loadedClasses = <LmsClass>[];
    for (var i = 0; i < approvedIds.length; i += 10) {
      final end = (i + 10 < approvedIds.length) ? i + 10 : approvedIds.length;
      final batch = approvedIds.sublist(i, end);
      final snap = await _db
          .collection('classes')
          .where(FieldPath.documentId, whereIn: batch)
          .get();
      for (final doc in snap.docs) {
        loadedClasses.add(LmsClass.fromMap(doc.id, doc.data()));
      }
    }

    return UserClassesResult(
      classes: loadedClasses,
      pendingMemberships: pendingMemberships,
    );
  }

  /// Memuat ulang dokumen kelas tunggal (`classes/{classId}`).
  Future<LmsClass?> fetchClassById(String classId) async {
    final cleanId = classId.trim();
    if (cleanId.isEmpty) return null;
    final snap = await _db.collection('classes').doc(cleanId).get();
    if (!snap.exists || snap.data() == null) return null;
    return LmsClass.fromMap(snap.id, snap.data()!);
  }

  /// Menghitung total item materi lintas pertemuan (selaras `computeClassMaterialsCount` web).
  static int computeClassMaterialsCount(List<Map<String, dynamic>> meetings) {
    var total = 0;
    for (final m in meetings) {
      final files = m['materialFiles'];
      if (files is List && files.isNotEmpty) {
        total += files.length;
      }
      if (UrlUtils.deltaContentToPlainText(m['deltaContent']).isNotEmpty) {
        total += 1;
      }
      final videoUrl = (m['videoUrl'] ?? '').toString().trim();
      final videos = m['videos'];
      if (m['hasVideo'] == true ||
          videoUrl.isNotEmpty ||
          (videos is List && videos.isNotEmpty)) {
        total += 1;
      }
      final pdfUrl = (m['pdfUrl'] ?? '').toString().trim();
      if (m['hasPdf'] == true || pdfUrl.isNotEmpty) {
        total += 1;
      }
    }
    return total;
  }

  /// Menyimpan perubahan array `meetings` kelas beserta `meetingsCount` & `materialsCount`.
  Future<void> updateClassMeetings({
    required String classId,
    required List<Map<String, dynamic>> rawMeetings,
  }) async {
    final materialsCount = computeClassMaterialsCount(rawMeetings);
    await _db.collection('classes').doc(classId.trim()).update(<String, dynamic>{
      'meetings': rawMeetings,
      'meetingsCount': rawMeetings.length,
      'materialsCount': materialsCount,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  // =========================================================================
  // EXAM LOCKOUT MONITOR (AI TUTOR)
  // =========================================================================

  /// Memantau sesi ujian aktif milik [uid] secara real-time di koleksi `exam_attempts`.
  Stream<String?> watchActiveExamClassId(String uid) {
    final cleanUid = uid.trim();
    if (cleanUid.isEmpty) {
      return Stream<String?>.value(null);
    }

    return _db
        .collection('exam_attempts')
        .where('uid', isEqualTo: cleanUid)
        .snapshots()
        .map((snap) {
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      for (final doc in snap.docs) {
        final data = doc.data();
        final inProgress = data['status'] == 'in_progress' ||
            (data['examActive'] == true && data['status'] != 'submitted');
        if (!inProgress) continue;

        final rawExp = data['examExpiresAt'];
        final expMs = rawExp is Timestamp
            ? rawExp.millisecondsSinceEpoch
            : rawExp is num
                ? rawExp.toInt()
                : 0;
        if (expMs == 0 || expMs > nowMs) {
          final classId = (data['classId'] ?? '').toString().trim();
          return classId.isNotEmpty ? classId : 'active';
        }
      }
      return null;
    });
  }

  // =========================================================================
  // MANUAL BOOKS (`manual_books/{bookId}`)
  // =========================================================================

  Future<List<ManualBookItem>> fetchManualBooks() async {
    final snap = await _db.collection('manual_books').get();
    final books = snap.docs
        .map((doc) => ManualBookItem.fromMap(doc.id, doc.data()))
        .toList(growable: true)
      ..sort((a, b) => b.sortMs.compareTo(a.sortMs));
    return books;
  }

  Future<ManualBookItem> createManualBook({
    required String title,
    required String fileUrl,
    required String uploadedByUid,
    required String uploadedByName,
    String description = '',
    String fileName = '',
    String fileSize = '',
    String storageType = 'cloudinary',
  }) async {
    final cleanTitle = title.trim();
    if (cleanTitle.isEmpty) {
      throw const FormatException('Judul Manual Book wajib diisi.');
    }
    final safeUrl = UrlUtils.sanitizeSafeUrl(fileUrl, requireHttps: true);
    if (safeUrl == null) {
      throw const FormatException(
        'URL PDF Manual Book harus berawalan https:// yang valid.',
      );
    }

    final cleanFileName =
        fileName.trim().isNotEmpty ? fileName.trim() : '$cleanTitle.pdf';
    final nowLabel = _formatShortDateLabel();
    final payload = <String, dynamic>{
      'title': cleanTitle,
      'description': description.trim(),
      'fileUrl': safeUrl,
      'fileName': cleanFileName,
      'fileSize': fileSize.trim(),
      'storageType':
          storageType == 'external_url' ? 'external_url' : 'cloudinary',
      'uploadedBy': uploadedByUid.trim(),
      'uploadedByName': uploadedByName.trim().isNotEmpty
          ? uploadedByName.trim()
          : 'Dosen / Admin',
      'createdAtLabel': nowLabel,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    };

    final docRef = await _db.collection('manual_books').add(payload);
    return ManualBookItem(
      id: docRef.id,
      title: cleanTitle,
      description: description.trim(),
      fileUrl: safeUrl,
      fileName: cleanFileName,
      fileSize: fileSize.trim(),
      storageType: payload['storageType'] as String,
      uploadedBy: uploadedByUid.trim(),
      uploadedByName: payload['uploadedByName'] as String,
      createdAtLabel: nowLabel,
      sortMs: DateTime.now().millisecondsSinceEpoch,
    );
  }

  Future<void> deleteManualBook(String bookId) async {
    final cleanId = bookId.trim();
    if (cleanId.isEmpty) return;
    await _db.collection('manual_books').doc(cleanId).delete();
  }

  // =========================================================================
  // ASSIGNMENTS & SUBMISSIONS
  // =========================================================================

  Future<List<AssignmentItem>> fetchClassAssignments(String classId) async {
    final snap = await _db
        .collection('assignments')
        .where('classId', isEqualTo: classId.trim())
        .get();
    final items = snap.docs
        .map((doc) => AssignmentItem.fromMap(doc.id, doc.data()))
        .toList(growable: true)
      ..sort((a, b) {
        final mCmp = a.meetingNo.compareTo(b.meetingNo);
        if (mCmp != 0) return mCmp;
        return a.title.compareTo(b.title);
      });
    return items;
  }

  /// Mengambil seluruh pengumpulan milik [uid] pada [classId], dipetakan per `assignmentId`.
  Future<Map<String, SubmissionItem>> fetchStudentClassSubmissions({
    required String classId,
    required String uid,
  }) async {
    final snap = await _db
        .collection('submissions')
        .where('classId', isEqualTo: classId.trim())
        .where('uid', isEqualTo: uid.trim())
        .get();

    final map = <String, SubmissionItem>{};
    for (final doc in snap.docs) {
      final item = SubmissionItem.fromMap(doc.id, doc.data());
      if (item.assignmentId.isNotEmpty) {
        map[item.assignmentId] = item;
      }
    }
    return map;
  }

  /// Mengambil seluruh pengumpulan mahasiswa di kelas untuk dosen/admin.
  Future<List<SubmissionItem>> fetchClassSubmissionsForGrading(
    String classId,
  ) async {
    final snap = await _db
        .collection('submissions')
        .where('classId', isEqualTo: classId.trim())
        .get();
    final items = snap.docs
        .map((doc) => SubmissionItem.fromMap(doc.id, doc.data()))
        .toList(growable: true)
      ..sort((a, b) => b.sortMs.compareTo(a.sortMs));
    return items;
  }

  Future<AssignmentItem> createAssignment({
    required String classId,
    required String createdByUid,
    required String title,
    required String subject,
    required String subjectCode,
    int meetingNo = 1,
    String taskType = 'individu',
    String deadline = '',
    String note = '',
    String attachmentUrl = '',
    String attachmentName = '',
    String attachmentSize = '',
  }) async {
    final cleanTitle = title.trim();
    if (cleanTitle.isEmpty) {
      throw const FormatException('Judul tugas wajib diisi.');
    }

    final safeTaskType =
        taskType.trim().toLowerCase() == 'kelompok' ? 'kelompok' : 'individu';
    final safeAttachmentUrl = attachmentUrl.trim().isEmpty
        ? ''
        : UrlUtils.sanitizeSafeUrl(attachmentUrl);
    if (attachmentUrl.trim().isNotEmpty && safeAttachmentUrl == null) {
      throw const FormatException(
        'URL lampiran instruksi harus berawalan https:// atau http://.',
      );
    }

    final resolvedAttachmentUrl = safeAttachmentUrl ?? '';
    final cleanAttachmentName = resolvedAttachmentUrl.isNotEmpty
        ? (attachmentName.trim().isNotEmpty
            ? attachmentName.trim()
            : 'Lampiran_Instruksi_Tugas')
        : '';
    final rawDeadline =
        deadline.trim().isNotEmpty ? deadline.trim() : '2026-12-15T23:59:00+07:00';
    final deadlineLabel = _formatDeadlineText(rawDeadline);
    final safeMeetingNo = meetingNo.clamp(1, 32);

    final payload = <String, dynamic>{
      'classId': classId.trim(),
      'meetingNo': safeMeetingNo,
      'title': cleanTitle,
      'subject': subject.trim().isNotEmpty ? subject.trim() : 'Mata Kuliah Smartsa',
      'subjectCode': subjectCode.trim().isNotEmpty ? subjectCode.trim() : 'CLS',
      'taskType': safeTaskType,
      'attachmentUrl': resolvedAttachmentUrl,
      'attachmentName': cleanAttachmentName,
      'attachmentSize':
          resolvedAttachmentUrl.isNotEmpty ? attachmentSize.trim() : '',
      'deadline': rawDeadline,
      'deadlineLabel': deadlineLabel,
      'note': note.trim().isNotEmpty
          ? note.trim()
          : 'Kumpulkan berkas tugas sesuai instruksi pertemuan.',
      'maxSize': '15 MB',
      'allowedFormats': '.pdf, .docx, .zip, .jpg, .png',
      'createdBy': createdByUid.trim(),
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    };

    final docRef = await _db.collection('assignments').add(payload);
    return AssignmentItem.fromMap(docRef.id, payload);
  }

  /// Menyimpan atau memperbarui pengumpulan tugas mahasiswa (`submissions/{assignmentId}_{uid}`).
  Future<SubmissionItem> submitAssignment({
    required String assignmentId,
    required String classId,
    required int meetingNo,
    required String assignmentTitle,
    required String className,
    required String uid,
    required String studentName,
    required String taskType,
    String groupName = '',
    List<String> groupMembers = const <String>[],
    String fileName = '',
    String fileSize = '',
    String fileUrl = '',
    String externalUrl = '',
    String storageType = 'cloudinary',
    String notes = '',
  }) async {
    final safeTaskType =
        taskType.trim().toLowerCase() == 'kelompok' ? 'kelompok' : 'individu';
    final cleanGroupName = groupName.trim();
    final cleanGroupMembers = groupMembers
        .map((m) => m.trim())
        .where((m) => m.isNotEmpty)
        .take(30)
        .toList(growable: false);

    if (safeTaskType == 'kelompok') {
      if (cleanGroupName.isEmpty) {
        throw const FormatException(
          'Nama Kelompok wajib diisi untuk tugas kelompok.',
        );
      }
      if (cleanGroupMembers.isEmpty) {
        throw const FormatException(
          'Daftar Anggota Kelompok wajib diisi untuk tugas kelompok.',
        );
      }
    }

    final safeFileUrl =
        fileUrl.trim().isEmpty ? '' : UrlUtils.sanitizeSafeUrl(fileUrl);
    final safeExternalUrl =
        externalUrl.trim().isEmpty ? '' : UrlUtils.sanitizeSafeUrl(externalUrl);

    if (fileUrl.trim().isNotEmpty && safeFileUrl == null) {
      throw const FormatException('URL berkas pengumpulan tidak valid.');
    }
    if (externalUrl.trim().isNotEmpty && safeExternalUrl == null) {
      throw const FormatException(
        'Tautan eksternal harus berawalan https:// atau http://.',
      );
    }

    final resolvedUrl = (safeFileUrl?.isNotEmpty == true)
        ? safeFileUrl!
        : (safeExternalUrl ?? '');
    if (resolvedUrl.isEmpty) {
      throw const FormatException(
        'Unggah berkas atau masukkan tautan URL tugas terlebih dahulu.',
      );
    }

    final submissionId = '${assignmentId.trim()}_${uid.trim()}';
    final subRef = _db.collection('submissions').doc(submissionId);
    final existingSnap = await subRef.get();

    if (existingSnap.exists && existingSnap.data() != null) {
      final existingData = existingSnap.data()!;
      if (existingData['grade'] != null || existingData['score'] != null) {
        throw StateError(
          'Tugas ini sudah dinilai oleh dosen dan terkunci (mode baca-saja).',
        );
      }
    }

    final nowLabel = _formatDateTimeLabel();
    final resolvedFileName = fileName.trim().isNotEmpty
        ? fileName.trim()
        : (safeExternalUrl ?? 'Tautan Tugas');
    final resolvedFileSize = fileSize.trim().isNotEmpty
        ? fileSize.trim()
        : (safeExternalUrl != null ? 'Tautan Eksternal' : '-');

    final commonFields = <String, dynamic>{
      'meetingNo': meetingNo.clamp(1, 32),
      'taskType': safeTaskType,
      'groupName': safeTaskType == 'kelompok' ? cleanGroupName : '',
      'groupMembers':
          safeTaskType == 'kelompok' ? cleanGroupMembers : <String>[],
      'studentName': studentName.trim().isNotEmpty
          ? studentName.trim()
          : 'Mahasiswa',
      'assignmentTitle': assignmentTitle.trim(),
      'className': className.trim(),
      'fileName': resolvedFileName,
      'fileSize': resolvedFileSize,
      'fileUrl': resolvedUrl,
      'externalUrl': safeExternalUrl ?? '',
      'storageType': storageType,
      'notes': notes.trim(),
      'status': 'submitted',
      'submittedAtLabel': nowLabel,
      'submittedAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    };

    if (!existingSnap.exists) {
      await subRef.set(<String, dynamic>{
        'submissionId': submissionId,
        'assignmentId': assignmentId.trim(),
        'classId': classId.trim(),
        'uid': uid.trim(),
        ...commonFields,
      });
    } else {
      // Sesuai firestore.rules: dilarang mengubah grade, score, feedback, gradedBy, uid, assignmentId, classId.
      await subRef.update(commonFields);
    }

    return SubmissionItem(
      id: submissionId,
      submissionId: submissionId,
      assignmentId: assignmentId.trim(),
      classId: classId.trim(),
      meetingNo: meetingNo.clamp(1, 32),
      uid: uid.trim(),
      studentName: commonFields['studentName'] as String,
      assignmentTitle: assignmentTitle.trim(),
      className: className.trim(),
      taskType: safeTaskType,
      groupName: commonFields['groupName'] as String,
      groupMembers: cleanGroupMembers,
      fileName: resolvedFileName,
      fileSize: resolvedFileSize,
      fileUrl: resolvedUrl,
      externalUrl: safeExternalUrl ?? '',
      storageType: storageType,
      notes: notes.trim(),
      status: 'submitted',
      submittedAtLabel: nowLabel,
      sortMs: DateTime.now().millisecondsSinceEpoch,
    );
  }

  /// Menyimpan nilai & umpan balik dosen/admin pada dokumen submission.
  Future<void> gradeSubmission({
    required String submissionId,
    required String gradedByUid,
    required num grade,
    String feedback = '',
  }) async {
    if (grade < 0 || grade > 100) {
      throw const FormatException('Nilai harus berada pada rentang 0 hingga 100.');
    }
    await _db
        .collection('submissions')
        .doc(submissionId.trim())
        .update(<String, dynamic>{
      'grade': grade,
      'score': grade,
      'feedback': feedback.trim(),
      'gradedBy': gradedByUid.trim(),
      'status': 'graded',
      'gradedAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  // =========================================================================
  // DISCUSSIONS (`discussions/{discussionId}`)
  // =========================================================================

  Stream<List<DiscussionTopic>> watchClassDiscussions(String classId) {
    return _db
        .collection('discussions')
        .where('classId', isEqualTo: classId.trim())
        .snapshots()
        .map((snap) {
      final list = snap.docs
          .map((doc) => DiscussionTopic.fromMap(doc.id, doc.data()))
          .toList(growable: true)
        ..sort((a, b) => b.sortMs.compareTo(a.sortMs));
      return list;
    });
  }

  Future<void> createDiscussionTopic({
    required String classId,
    required int meetingNo,
    required String subject,
    required String content,
    required String authorUid,
    required String authorName,
    String avatar = '',
  }) async {
    final cleanContent = content.trim();
    if (cleanContent.isEmpty) {
      throw const FormatException('Isi pertanyaan/topik diskusi wajib diisi.');
    }

    await _db.collection('discussions').add(<String, dynamic>{
      'classId': classId.trim(),
      'meetingNo': meetingNo.clamp(1, 32),
      'subject':
          subject.trim().isNotEmpty ? subject.trim() : 'Forum Diskusi Kelas',
      'authorUid': authorUid.trim(),
      'author':
          authorName.trim().isNotEmpty ? authorName.trim() : 'Pengguna Smartsa',
      'avatar': avatar.trim(),
      'content': cleanContent,
      'likes': 0,
      'likedBy': <String>[],
      'replies': <Map<String, dynamic>>[],
      'isVerifiedAnswer': false,
      'verifiedBy': '',
      'verifiedReplyId': '',
      'timeLabel': 'Hari ini, ${_formatTimeLabel()}',
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Toggle Like berbasis transaksi Firestore agar bebas race condition dan
  /// mematuhi `isValidMemberLikeUpdate` di `firestore.rules`.
  Future<void> toggleDiscussionLike({
    required String discussionId,
    required String uid,
  }) async {
    final ref = _db.collection('discussions').doc(discussionId.trim());
    await _db.runTransaction((tx) async {
      final snap = await tx.get(ref);
      if (!snap.exists || snap.data() == null) return;
      final data = snap.data()!;
      final rawLikedBy = data['likedBy'];
      final current = rawLikedBy is List
          ? rawLikedBy.map((e) => e.toString()).where((s) => s.isNotEmpty).toList()
          : <String>[];

      final nextLikedBy = current.contains(uid)
          ? current.where((id) => id != uid).toList()
          : <String>[...current, uid];

      tx.update(ref, <String, dynamic>{
        'likes': nextLikedBy.length,
        'likedBy': nextLikedBy,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    });
  }

  /// Menambahkan balasan diskusi secara transaksional sesuai `isValidMemberReplyAdd`.
  Future<void> addDiscussionReply({
    required String discussionId,
    required String uid,
    required String authorName,
    required String content,
  }) async {
    final cleanContent = content.trim();
    if (cleanContent.isEmpty) {
      throw const FormatException('Isi balasan tidak boleh kosong.');
    }

    final replyId =
        'rep_${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(9999)}';
    final newReply = <String, dynamic>{
      'id': replyId,
      'authorUid': uid.trim(),
      'author':
          authorName.trim().isNotEmpty ? authorName.trim() : 'Pengguna Smartsa',
      'time': 'Hari ini, ${_formatTimeLabel()}',
      'content': cleanContent,
    };

    final ref = _db.collection('discussions').doc(discussionId.trim());
    await _db.runTransaction((tx) async {
      final snap = await tx.get(ref);
      if (!snap.exists || snap.data() == null) {
        throw StateError('Topik diskusi tidak ditemukan.');
      }
      final rawReplies = snap.data()!['replies'];
      final existing = rawReplies is List
          ? List<dynamic>.from(rawReplies)
          : <dynamic>[];
      tx.update(ref, <String, dynamic>{
        'replies': <dynamic>[...existing, newReply],
        'updatedAt': FieldValue.serverTimestamp(),
      });
    });
  }

  // =========================================================================
  // CLASS MEMBERS (`class_members/{classId}_{uid}`)
  // =========================================================================

  Future<List<ClassMembership>> fetchClassMembers(String classId) async {
    final snap = await _db
        .collection('class_members')
        .where('classId', isEqualTo: classId.trim())
        .get();
    return snap.docs
        .map((doc) => ClassMembership.fromMap(doc.id, doc.data()))
        .toList(growable: false);
  }

  // =========================================================================
  // ATTENDANCE (`attendance/{classId}_m{meetingNo}_{uid}` & activeAttendanceSession)
  // =========================================================================

  /// Memantau status sesi presensi aktif kelas (`classes/{classId}.activeAttendanceSession`).
  Stream<AttendanceSession?> watchClassAttendanceSession(String classId) {
    final cleanId = classId.trim();
    if (cleanId.isEmpty) return Stream<AttendanceSession?>.value(null);
    return _db.collection('classes').doc(cleanId).snapshots().map((snap) {
      if (!snap.exists || snap.data() == null) return null;
      return AttendanceSession.fromMap(snap.data()!['activeAttendanceSession']);
    });
  }

  /// Membaca sesi presensi aktif kelas secara one-shot.
  Future<AttendanceSession?> fetchClassAttendanceSession(String classId) async {
    final cleanId = classId.trim();
    if (cleanId.isEmpty) return null;
    final snap = await _db.collection('classes').doc(cleanId).get();
    if (!snap.exists || snap.data() == null) return null;
    return AttendanceSession.fromMap(snap.data()!['activeAttendanceSession']);
  }

  /// Membuka sesi presensi QR baru pada dokumen kelas (khusus dosen pengampu/admin).
  Future<AttendanceSession> openAttendanceSession({
    required String classId,
    required String classCode,
    required int meetingNo,
    required String openedByUid,
    int durationMinutes = 15,
    String customCode = '',
  }) async {
    final cleanId = classId.trim();
    if (cleanId.isEmpty || meetingNo < 1 || meetingNo > 32) {
      throw const FormatException(
        'ID kelas atau nomor pertemuan (1–32) tidak valid.',
      );
    }

    final mins = durationMinutes.clamp(1, 180);
    final padded = meetingNo.toString().padLeft(2, '0');
    final cleanCustom = customCode
        .trim()
        .toUpperCase()
        .replaceAll(RegExp(r'[^A-Z0-9-]'), '');
    final baseCode = classCode.trim().isEmpty
        ? 'CLS'
        : classCode.trim().toUpperCase().replaceAll(RegExp(r'[^A-Z0-9-]'), '');
    final randomSuffix = 1000 + Random().nextInt(9000);
    final sessionCode =
        cleanCustom.isNotEmpty ? cleanCustom : '$baseCode-M$padded-$randomSuffix';

    final nowMs = DateTime.now().millisecondsSinceEpoch;
    final expiresAtMs = nowMs + mins * 60 * 1000;

    final payload = <String, dynamic>{
      'meetingNo': meetingNo,
      'sessionCode': sessionCode,
      'openedAt': nowMs,
      'expiresAt': expiresAtMs,
      'openedBy': openedByUid.trim(),
      'isOpen': true,
    };

    await _db.collection('classes').doc(cleanId).update(<String, dynamic>{
      'activeAttendanceSession': payload,
      'updatedAt': FieldValue.serverTimestamp(),
    });

    return AttendanceSession(
      meetingNo: meetingNo,
      sessionCode: sessionCode,
      openedAtMs: nowMs,
      expiresAtMs: expiresAtMs,
      openedBy: openedByUid.trim(),
      isOpen: true,
    );
  }

  /// Menutup sesi presensi aktif kelas.
  Future<void> closeAttendanceSession(String classId) async {
    final cleanId = classId.trim();
    if (cleanId.isEmpty) return;
    await _db.collection('classes').doc(cleanId).update(<String, dynamic>{
      'activeAttendanceSession': null,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Stream real-time daftar mahasiswa yang hadir pada kelas (single-field query `classId`).
  Stream<List<AttendanceRecord>> watchClassAttendees(String classId) {
    final cleanId = classId.trim();
    if (cleanId.isEmpty) {
      return Stream<List<AttendanceRecord>>.value(const <AttendanceRecord>[]);
    }
    return _db
        .collection('attendance')
        .where('classId', isEqualTo: cleanId)
        .snapshots()
        .map((snap) {
      final list = snap.docs
          .map((doc) => AttendanceRecord.fromMap(doc.id, doc.data()))
          .toList(growable: true)
        ..sort((a, b) {
          final byTime = b.sortMs.compareTo(a.sortMs);
          return byTime != 0 ? byTime : a.meetingNo.compareTo(b.meetingNo);
        });
      return list;
    });
  }

  /// Memuat riwayat presensi mahasiswa tertentu pada suatu kelas (`classId`, `uid`, `meetingNo`).
  Future<StudentClassAttendanceSummary> fetchStudentClassAttendance({
    required String classId,
    required String uid,
  }) async {
    final cleanClassId = classId.trim();
    final cleanUid = uid.trim();
    if (cleanClassId.isEmpty || cleanUid.isEmpty) {
      return const StudentClassAttendanceSummary(
        records: <AttendanceRecord>[],
        attendedMeetingNos: <int>[],
        progressPercent: 0,
      );
    }

    final snap = await _db
        .collection('attendance')
        .where('classId', isEqualTo: cleanClassId)
        .where('uid', isEqualTo: cleanUid)
        .orderBy('meetingNo')
        .get();

    final ascending = snap.docs
        .map((doc) => AttendanceRecord.fromMap(doc.id, doc.data()))
        .toList(growable: false);
    final orders = ascending.map((r) => r.meetingNo).toList(growable: false);
    final progress = (orders.length >= 16 ? 100 : orders.length * 6).clamp(0, 100);

    return StudentClassAttendanceSummary(
      records: ascending.reversed.toList(growable: false),
      attendedMeetingNos: orders,
      progressPercent: progress,
    );
  }

  /// Mencatat kehadiran mahasiswa ke Firestore setelah validasi payload QR/kode, sesi aktif,
  /// keanggotaan kelas, dan duplikasi pertemuan (100% selaras `attendanceService.js` & `firestore.rules`).
  Future<AttendanceCheckInResult> recordMeetingAttendance({
    required String classId,
    required String uid,
    required String studentName,
    required String rawQrOrCode,
  }) async {
    final cleanClassId = classId.trim();
    final cleanUid = uid.trim();
    if (cleanClassId.isEmpty || cleanUid.isEmpty) {
      return const AttendanceCheckInResult(
        success: false,
        message: 'Data kelas atau pengguna tidak valid.',
      );
    }

    final parsedCode = AttendanceQrUtils.parsePayload(rawQrOrCode);
    if (!AttendanceQrUtils.isValidSessionCode(parsedCode)) {
      return const AttendanceCheckInResult(
        success: false,
        invalidCode: true,
        message: 'Format kode sesi presensi tidak valid atau kosong.',
      );
    }

    final classSnap = await _db.collection('classes').doc(cleanClassId).get();
    if (!classSnap.exists || classSnap.data() == null) {
      return const AttendanceCheckInResult(
        success: false,
        message: 'Dokumen kelas tidak ditemukan di Firestore.',
      );
    }

    final classData = classSnap.data()!;
    final activeSession = AttendanceSession.fromMap(
      classData['activeAttendanceSession'],
    );
    if (activeSession == null || !activeSession.isOpen) {
      return const AttendanceCheckInResult(
        success: false,
        noActiveSession: true,
        message: 'Dosen belum membuka sesi presensi untuk mata kuliah ini.',
      );
    }

    if (activeSession.isExpired) {
      return const AttendanceCheckInResult(
        success: false,
        expired: true,
        message: 'Sesi presensi telah kedaluwarsa. Minta dosen membuka sesi baru.',
      );
    }

    if (parsedCode != activeSession.sessionCode) {
      return const AttendanceCheckInResult(
        success: false,
        invalidCode: true,
        message:
            'Kode sesi presensi tidak valid atau tidak sesuai dengan sesi yang dibuka dosen.',
      );
    }

    final meetingNo = activeSession.meetingNo;
    if (meetingNo < 1 || meetingNo > 32) {
      return const AttendanceCheckInResult(
        success: false,
        message: 'Nomor pertemuan pada sesi presensi tidak valid.',
      );
    }

    final memberSnap = await _db
        .collection('class_members')
        .doc('${cleanClassId}_$cleanUid')
        .get();
    final memberStatus =
        memberSnap.exists ? (memberSnap.data()?['status'] ?? 'approved').toString().trim().toLowerCase() : null;
    final isApproved = memberSnap.exists &&
        (memberStatus == null ||
            memberStatus.isEmpty ||
            memberStatus == 'approved' ||
            memberStatus == 'active');

    final classCodeLabel = (classData['code'] ?? cleanClassId).toString().trim();
    if (!isApproved) {
      return AttendanceCheckInResult(
        success: false,
        notMember: true,
        message: memberSnap.exists
            ? 'Keanggotaan Anda di kelas $classCodeLabel masih menunggu persetujuan dosen/admin.'
            : 'Anda belum tergabung di kelas $classCodeLabel. Silakan gabung kelas terlebih dahulu.',
      );
    }

    final attendanceId = '${cleanClassId}_m${meetingNo}_$cleanUid';
    final attRef = _db.collection('attendance').doc(attendanceId);
    final existingSnap = await attRef.get();
    final padded = meetingNo.toString().padLeft(2, '0');
    if (existingSnap.exists) {
      return AttendanceCheckInResult(
        success: false,
        alreadyAttended: true,
        meetingNo: meetingNo,
        message: 'Pertemuan $padded sudah pernah Anda presensi sebelumnya.',
      );
    }

    final classTitle =
        (classData['title'] ?? classData['name'] ?? '').toString().trim();
    final resolvedTitle = classTitle.isNotEmpty
        ? 'Pertemuan $padded: $classTitle'
        : 'Pertemuan $padded';

    await attRef.set(<String, dynamic>{
      'attendanceId': attendanceId,
      'classId': cleanClassId,
      'uid': cleanUid,
      'studentName':
          studentName.trim().isNotEmpty ? studentName.trim() : 'Mahasiswa',
      'meetingNo': meetingNo,
      'meetingTitle': resolvedTitle,
      'sessionCode': activeSession.sessionCode,
      'status': 'TERVERIFIKASI',
      'progressGained': 6,
      'timestampLabel': _formatDateTimeLabel(),
      'recordedAt': FieldValue.serverTimestamp(),
    });

    final summary = await fetchStudentClassAttendance(
      classId: cleanClassId,
      uid: cleanUid,
    );

    return AttendanceCheckInResult(
      success: true,
      meetingNo: meetingNo,
      progressPercent: summary.progressPercent,
      message:
          'Presensi Pertemuan $padded berhasil diverifikasi di Firestore! Progres +6% (Total ${summary.progressPercent}%).',
    );
  }

  // =========================================================================
  // EXAMS & EXAM ATTEMPTS (`exams/*` & `exam_attempts/*`; NEVER reads `exam_keys`)
  // =========================================================================

  /// Memuat dokumen soal bebas kunci `exams/{classId}_m{meetingNo}_{examType}`.
  Future<MeetingExam?> fetchMeetingExam({
    required String classId,
    required int meetingNo,
    required String examType,
  }) async {
    final cleanClassId = classId.trim();
    final safeType = examType == 'posttest' ? 'posttest' : 'pretest';
    if (cleanClassId.isEmpty || meetingNo < 1 || meetingNo > 32) {
      return null;
    }

    final examId = '${cleanClassId}_m${meetingNo}_$safeType';
    final snap = await _db.collection('exams').doc(examId).get();
    if (!snap.exists || snap.data() == null) return null;
    return MeetingExam.fromMap(snap.id, snap.data()!);
  }

  /// Memuat riwayat attempt ujian milik satu mahasiswa dalam satu kelas (`classId`, `uid`).
  Future<List<ExamAttempt>> fetchUserClassExamAttempts({
    required String classId,
    required String uid,
  }) async {
    final cleanClassId = classId.trim();
    final cleanUid = uid.trim();
    if (cleanClassId.isEmpty || cleanUid.isEmpty) return const <ExamAttempt>[];

    final snap = await _db
        .collection('exam_attempts')
        .where('classId', isEqualTo: cleanClassId)
        .where('uid', isEqualTo: cleanUid)
        .get();

    final list = snap.docs
        .map((doc) => ExamAttempt.fromMap(doc.id, doc.data()))
        .toList(growable: true)
      ..sort((a, b) => b.sortMs.compareTo(a.sortMs));
    return list;
  }

  /// Memuat seluruh attempt evaluasi kelas untuk rekap nilai & Gain dosen/admin.
  Future<List<ExamAttempt>> fetchClassExamAttempts(String classId) async {
    final cleanClassId = classId.trim();
    if (cleanClassId.isEmpty) return const <ExamAttempt>[];

    final snap = await _db
        .collection('exam_attempts')
        .where('classId', isEqualTo: cleanClassId)
        .get();

    final list = snap.docs
        .map((doc) => ExamAttempt.fromMap(doc.id, doc.data()))
        .toList(growable: true)
      ..sort((a, b) => b.sortMs.compareTo(a.sortMs));
    return list;
  }

  static String _formatTimeLabel() {
    final now = DateTime.now();
    final hh = now.hour.toString().padLeft(2, '0');
    final mm = now.minute.toString().padLeft(2, '0');
    return '$hh:$mm WIB';
  }

  static String _formatShortDateLabel() {
    final now = DateTime.now();
    const months = <String>[
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Mei',
      'Jun',
      'Jul',
      'Agu',
      'Sep',
      'Okt',
      'Nov',
      'Des',
    ];
    return '${now.day} ${months[now.month - 1]} ${now.year}';
  }

  static String _formatDateTimeLabel() {
    return '${_formatShortDateLabel()}, ${_formatTimeLabel()}';
  }

  static String _formatDeadlineText(String rawIso) {
    final dt = DateTime.tryParse(rawIso);
    if (dt == null) return rawIso;
    const months = <String>[
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Mei',
      'Jun',
      'Jul',
      'Agu',
      'Sep',
      'Okt',
      'Nov',
      'Des',
    ];
    final local = dt.toLocal();
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    return '${local.day} ${months[local.month - 1]} ${local.year}, $hh:$mm WIB';
  }
}
