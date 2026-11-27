import 'package:cloud_firestore/cloud_firestore.dart';

/// Model tugas kelas pada koleksi `assignments/{assignmentId}`.
class AssignmentItem {
  const AssignmentItem({
    required this.id,
    required this.classId,
    required this.meetingNo,
    required this.title,
    required this.subject,
    required this.subjectCode,
    required this.taskType,
    required this.attachmentUrl,
    required this.attachmentName,
    required this.attachmentSize,
    required this.deadline,
    required this.deadlineLabel,
    required this.note,
    required this.maxSize,
    required this.allowedFormats,
  });

  final String id;
  final String classId;
  final int meetingNo;
  final String title;
  final String subject;
  final String subjectCode;
  final String taskType; // 'individu' | 'kelompok'
  final String attachmentUrl;
  final String attachmentName;
  final String attachmentSize;
  final String deadline;
  final String deadlineLabel;
  final String note;
  final String maxSize;
  final String allowedFormats;

  bool get isGroupTask => taskType == 'kelompok';

  String get displayDeadline {
    if (deadlineLabel.isNotEmpty) return deadlineLabel;
    if (deadline.isNotEmpty) return deadline;
    return 'Sesuai jadwal';
  }

  factory AssignmentItem.fromMap(String id, Map<String, dynamic> map) {
    final rawType = (map['taskType'] ?? 'individu').toString().trim().toLowerCase();
    final rawMeeting = map['meetingNo'];
    final parsedMeeting = rawMeeting is num
        ? rawMeeting.toInt()
        : int.tryParse(rawMeeting?.toString() ?? '') ?? 1;

    return AssignmentItem(
      id: id,
      classId: (map['classId'] ?? '').toString().trim(),
      meetingNo: parsedMeeting.clamp(1, 32),
      title: (map['title'] ?? 'Tugas Perkuliahan').toString().trim(),
      subject: (map['subject'] ?? 'Mata Kuliah').toString().trim(),
      subjectCode: (map['subjectCode'] ?? 'CLS').toString().trim(),
      taskType: rawType == 'kelompok' ? 'kelompok' : 'individu',
      attachmentUrl: (map['attachmentUrl'] ?? '').toString().trim(),
      attachmentName: (map['attachmentName'] ?? '').toString().trim(),
      attachmentSize: (map['attachmentSize'] ?? '').toString().trim(),
      deadline: (map['deadline'] ?? '').toString().trim(),
      deadlineLabel: (map['deadlineLabel'] ?? '').toString().trim(),
      note: (map['note'] ?? '').toString().trim(),
      maxSize: (map['maxSize'] ?? '15 MB').toString().trim(),
      allowedFormats:
          (map['allowedFormats'] ?? '.pdf, .docx, .zip, .jpg, .png')
              .toString()
              .trim(),
    );
  }
}

/// Model pengumpulan tugas pada `submissions/{assignmentId}_{uid}`.
class SubmissionItem {
  const SubmissionItem({
    required this.id,
    required this.submissionId,
    required this.assignmentId,
    required this.classId,
    required this.uid,
    required this.studentName,
    required this.assignmentTitle,
    required this.className,
    required this.taskType,
    required this.groupName,
    required this.groupMembers,
    required this.fileName,
    required this.fileSize,
    required this.fileUrl,
    required this.externalUrl,
    required this.storageType,
    required this.notes,
    required this.status,
    required this.submittedAtLabel,
    this.meetingNo,
    this.grade,
    this.score,
    this.feedback = '',
    this.sortMs = 0,
  });

  final String id;
  final String submissionId;
  final String assignmentId;
  final String classId;
  final int? meetingNo;
  final String uid;
  final String studentName;
  final String assignmentTitle;
  final String className;
  final String taskType;
  final String groupName;
  final List<String> groupMembers;
  final String fileName;
  final String fileSize;
  final String fileUrl;
  final String externalUrl;
  final String storageType;
  final String notes;
  final String status;
  final String submittedAtLabel;
  final num? grade;
  final num? score;
  final String feedback;
  final int sortMs;

  /// Nilai efektif dari field `grade` atau fallback `score`.
  num? get effectiveGrade => grade ?? score;

  /// Sesuai `firestore.rules`: bila `grade != null || score != null`,
  /// mahasiswa dilarang mengubah atau menghapus submission (mode baca-saja).
  bool get isLocked => grade != null || score != null;

  String get effectiveUrl => fileUrl.isNotEmpty ? fileUrl : externalUrl;

  factory SubmissionItem.fromMap(String id, Map<String, dynamic> map) {
    final rawMembers = map['groupMembers'];
    final members = rawMembers is List
        ? rawMembers.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList(growable: false)
        : const <String>[];

    final rawMeeting = map['meetingNo'];
    final parsedMeeting = rawMeeting is num
        ? rawMeeting.toInt()
        : int.tryParse(rawMeeting?.toString() ?? '');

    final rawType = (map['taskType'] ?? 'individu').toString().trim().toLowerCase();

    return SubmissionItem(
      id: id,
      submissionId: (map['submissionId'] ?? id).toString().trim(),
      assignmentId: (map['assignmentId'] ?? '').toString().trim(),
      classId: (map['classId'] ?? '').toString().trim(),
      meetingNo: parsedMeeting,
      uid: (map['uid'] ?? '').toString().trim(),
      studentName: (map['studentName'] ?? map['uid'] ?? 'Mahasiswa').toString().trim(),
      assignmentTitle: (map['assignmentTitle'] ?? '').toString().trim(),
      className: (map['className'] ?? '').toString().trim(),
      taskType: rawType == 'kelompok' ? 'kelompok' : 'individu',
      groupName: (map['groupName'] ?? '').toString().trim(),
      groupMembers: members,
      fileName: (map['fileName'] ?? '').toString().trim(),
      fileSize: (map['fileSize'] ?? '').toString().trim(),
      fileUrl: (map['fileUrl'] ?? '').toString().trim(),
      externalUrl: (map['externalUrl'] ?? '').toString().trim(),
      storageType: (map['storageType'] ?? 'cloudinary').toString().trim(),
      notes: (map['notes'] ?? '').toString().trim(),
      status: (map['status'] ?? 'submitted').toString().trim(),
      submittedAtLabel: (map['submittedAtLabel'] ?? 'Tercatat di Firestore').toString().trim(),
      grade: map['grade'] is num ? map['grade'] as num : null,
      score: map['score'] is num ? map['score'] as num : null,
      feedback: (map['feedback'] ?? '').toString().trim(),
      sortMs: _toMillis(map['submittedAt'] ?? map['updatedAt']),
    );
  }

  static int _toMillis(dynamic value) {
    if (value is Timestamp) return value.millisecondsSinceEpoch;
    if (value is num) return value.toInt();
    if (value is String) {
      return DateTime.tryParse(value)?.millisecondsSinceEpoch ?? 0;
    }
    return 0;
  }
}
