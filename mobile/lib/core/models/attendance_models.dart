import 'package:cloud_firestore/cloud_firestore.dart';

/// Sesi presensi QR aktif yang disimpan pada `classes/{classId}.activeAttendanceSession`.
class AttendanceSession {
  const AttendanceSession({
    required this.meetingNo,
    required this.sessionCode,
    required this.openedAtMs,
    required this.expiresAtMs,
    required this.openedBy,
    required this.isOpen,
  });

  final int meetingNo;
  final String sessionCode;
  final int openedAtMs;
  final int expiresAtMs;
  final String openedBy;
  final bool isOpen;

  bool get isExpired =>
      expiresAtMs > 0 && DateTime.now().millisecondsSinceEpoch > expiresAtMs;

  bool get isCurrentlyOpen => isOpen && sessionCode.isNotEmpty && !isExpired;

  Duration get remainingDuration {
    if (expiresAtMs <= 0) return Duration.zero;
    final diff = expiresAtMs - DateTime.now().millisecondsSinceEpoch;
    return diff > 0 ? Duration(milliseconds: diff) : Duration.zero;
  }

  static int parseMillis(dynamic value) {
    if (value == null) return 0;
    if (value is Timestamp) return value.millisecondsSinceEpoch;
    if (value is num) return value.toInt();
    if (value is String) {
      final parsedInt = int.tryParse(value.trim());
      if (parsedInt != null) return parsedInt;
      final dt = DateTime.tryParse(value.trim());
      return dt?.millisecondsSinceEpoch ?? 0;
    }
    return 0;
  }

  static AttendanceSession? fromMap(dynamic raw) {
    if (raw is! Map) return null;
    final map = Map<String, dynamic>.from(raw);
    final code = (map['sessionCode'] ?? '').toString().trim().toUpperCase();
    final rawMeeting = map['meetingNo'];
    final meetingNo = rawMeeting is num
        ? rawMeeting.toInt()
        : int.tryParse(rawMeeting?.toString() ?? '') ?? 1;

    return AttendanceSession(
      meetingNo: meetingNo.clamp(1, 32),
      sessionCode: code,
      openedAtMs: parseMillis(map['openedAt']),
      expiresAtMs: parseMillis(map['expiresAt']),
      openedBy: (map['openedBy'] ?? '').toString().trim(),
      isOpen: map['isOpen'] == true && code.isNotEmpty,
    );
  }
}

/// Catatan kehadiran mahasiswa pada `attendance/{classId}_m{meetingNo}_{uid}`.
class AttendanceRecord {
  const AttendanceRecord({
    required this.id,
    required this.classId,
    required this.uid,
    required this.studentName,
    required this.meetingNo,
    required this.meetingTitle,
    required this.sessionCode,
    required this.status,
    required this.progressGained,
    required this.timestampLabel,
    required this.sortMs,
  });

  final String id;
  final String classId;
  final String uid;
  final String studentName;
  final int meetingNo;
  final String meetingTitle;
  final String sessionCode;
  final String status;
  final int progressGained;
  final String timestampLabel;
  final int sortMs;

  factory AttendanceRecord.fromMap(String id, Map<String, dynamic> map) {
    final rawMeeting = map['meetingNo'];
    final meetingNo = rawMeeting is num
        ? rawMeeting.toInt()
        : int.tryParse(rawMeeting?.toString() ?? '') ?? 1;
    final rawProgress = map['progressGained'];
    final progress = rawProgress is num
        ? rawProgress.toInt()
        : int.tryParse(rawProgress?.toString() ?? '') ?? 6;
    final recordedAtMs = AttendanceSession.parseMillis(map['recordedAt']);
    final student = (map['studentName'] ?? '').toString().trim();

    return AttendanceRecord(
      id: id,
      classId: (map['classId'] ?? '').toString().trim(),
      uid: (map['uid'] ?? '').toString().trim(),
      studentName: student.isNotEmpty
          ? student
          : ((map['uid'] ?? '').toString().trim().isNotEmpty
                ? (map['uid'] ?? '').toString().trim()
                : 'Mahasiswa'),
      meetingNo: meetingNo,
      meetingTitle: (map['meetingTitle'] ?? 'Pertemuan $meetingNo')
          .toString()
          .trim(),
      sessionCode: (map['sessionCode'] ?? '').toString().trim().toUpperCase(),
      status: (map['status'] ?? 'TERVERIFIKASI').toString().trim(),
      progressGained: progress,
      timestampLabel: (map['timestampLabel'] ?? 'Tercatat di Firestore')
          .toString()
          .trim(),
      sortMs: recordedAtMs,
    );
  }
}

/// Ringkasan riwayat presensi mahasiswa pada satu kelas.
class StudentClassAttendanceSummary {
  const StudentClassAttendanceSummary({
    required this.records,
    required this.attendedMeetingNos,
    required this.progressPercent,
  });

  final List<AttendanceRecord> records;
  final List<int> attendedMeetingNos;
  final int progressPercent;
}

/// Hasil pencatatan presensi QR maupun kode manual.
class AttendanceCheckInResult {
  const AttendanceCheckInResult({
    required this.success,
    required this.message,
    this.alreadyAttended = false,
    this.expired = false,
    this.noActiveSession = false,
    this.invalidCode = false,
    this.notMember = false,
    this.meetingNo,
    this.progressPercent,
  });

  final bool success;
  final String message;
  final bool alreadyAttended;
  final bool expired;
  final bool noActiveSession;
  final bool invalidCode;
  final bool notMember;
  final int? meetingNo;
  final int? progressPercent;
}
