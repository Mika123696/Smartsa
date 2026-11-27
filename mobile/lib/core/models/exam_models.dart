import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/lms_class.dart';
import '../utils/exam_draft_store.dart';

/// Satu butir soal pilihan ganda (2–6 opsi, default 5 opsi A–E).
class ExamQuestion {
  const ExamQuestion({
    required this.id,
    required this.question,
    required this.options,
  });

  final String id;
  final String question;
  final List<String> options;

  ExamQuestion copyWith({
    String? id,
    String? question,
    List<String>? options,
  }) {
    return ExamQuestion(
      id: id ?? this.id,
      question: question ?? this.question,
      options: options ?? this.options,
    );
  }

  Map<String, dynamic> toMap() {
    return <String, dynamic>{
      'id': id.trim(),
      'question': question.trim(),
      'options': options.map((e) => e.trim()).toList(growable: false),
    };
  }

  factory ExamQuestion.empty(int index) {
    return ExamQuestion(
      id: 'q$index',
      question: '',
      options: <String>['', '', '', '', ''],
    );
  }

  factory ExamQuestion.fromMap(Map<String, dynamic> map, {int fallbackIdx = 1}) {
    final rawOpts = map['options'];
    final opts = rawOpts is List
        ? rawOpts.map((e) => e.toString()).toList(growable: false)
        : const <String>['', '', '', '', ''];
    final rawId = (map['id'] ?? '').toString().trim();
    return ExamQuestion(
      id: rawId.isNotEmpty ? rawId : 'q$fallbackIdx',
      question: (map['question'] ?? '').toString().trim(),
      options: opts.isEmpty ? const <String>['', '', '', '', ''] : opts,
    );
  }
}

/// Konfigurasi ujian bebas kunci dari koleksi `exams/{classId}_m{meetingNo}_{examType}`.
class MeetingExam {
  const MeetingExam({
    required this.id,
    required this.classId,
    required this.meetingNo,
    required this.examType,
    required this.title,
    required this.status,
    required this.durationMinutes,
    required this.deadline,
    required this.questions,
    required this.pointsPerQuestion,
  });

  final String id;
  final String classId;
  final int meetingNo;
  final String examType;
  final String title;
  final String status;
  final int durationMinutes;
  final String? deadline;
  final List<ExamQuestion> questions;
  final double pointsPerQuestion;

  bool get isConfigured => questions.isNotEmpty;
  bool get isPublished => status == 'published';
  bool get isDraft => status == 'draft';
  bool get isArchived => status == 'archived';

  double get effectivePointsPerQuestion => pointsPerQuestion > 0
      ? pointsPerQuestion
      : ExamDraftStore.computePointsPerQuestion(questions.length);

  int? get deadlineMillis {
    if (deadline == null || deadline!.trim().isEmpty) return null;
    final parsedInt = int.tryParse(deadline!.trim());
    if (parsedInt != null && parsedInt > 0) return parsedInt;
    final dt = DateTime.tryParse(deadline!.trim());
    return dt?.millisecondsSinceEpoch;
  }

  factory MeetingExam.fromMap(String id, Map<String, dynamic> map) {
    final rawQuestions = map['questions'];
    final parsedQuestions = <ExamQuestion>[];
    if (rawQuestions is List) {
      for (var i = 0; i < rawQuestions.length; i++) {
        final item = rawQuestions[i];
        if (item is Map) {
          parsedQuestions.add(
            ExamQuestion.fromMap(
              Map<String, dynamic>.from(item),
              fallbackIdx: i + 1,
            ),
          );
        }
      }
    }

    final rawStatus = (map['status'] ?? 'published').toString().trim().toLowerCase();
    final safeStatus =
        (rawStatus == 'draft' || rawStatus == 'archived') ? rawStatus : 'published';

    final rawDur = map['durationMinutes'];
    final parsedDur = rawDur is num
        ? rawDur.toInt()
        : int.tryParse(rawDur?.toString() ?? '') ?? 15;
    final safeDuration = (parsedDur >= 1 && parsedDur <= 180) ? parsedDur : 15;

    final rawMeeting = map['meetingNo'];
    final parsedMeeting = rawMeeting is num
        ? rawMeeting.toInt()
        : int.tryParse(rawMeeting?.toString() ?? '') ?? 1;

    final rawPoints = map['pointsPerQuestion'];
    final parsedPoints = rawPoints is num
        ? rawPoints.toDouble()
        : double.tryParse(rawPoints?.toString() ?? '') ?? 0;

    final rawDeadline = map['deadline'];
    final deadlineStr = rawDeadline == null
        ? null
        : rawDeadline is Timestamp
            ? rawDeadline.toDate().toIso8601String()
            : rawDeadline.toString().trim().isEmpty
                ? null
                : rawDeadline.toString().trim();

    final examType = (map['examType'] ?? '').toString().trim().toLowerCase() == 'posttest'
        ? 'posttest'
        : 'pretest';

    return MeetingExam(
      id: id,
      classId: (map['classId'] ?? '').toString().trim(),
      meetingNo: parsedMeeting,
      examType: examType,
      title: (map['title'] ?? '').toString().trim(),
      status: safeStatus,
      durationMinutes: safeDuration,
      deadline: deadlineStr,
      questions: parsedQuestions,
      pointsPerQuestion: parsedPoints > 0
          ? parsedPoints
          : ExamDraftStore.computePointsPerQuestion(parsedQuestions.length),
    );
  }
}

/// Catatan pengerjaan & hasil nilai dari `exam_attempts/{classId}_m{meetingNo}_{examType}_{uid}`.
class ExamAttempt {
  const ExamAttempt({
    required this.id,
    required this.attemptId,
    required this.classId,
    required this.meetingNo,
    required this.uid,
    required this.studentName,
    required this.studentEmail,
    required this.examType,
    required this.status,
    required this.examActive,
    required this.examExpiresAtMs,
    required this.score,
    required this.correctCount,
    required this.totalQuestions,
    required this.pointsPerQuestion,
    required this.passed,
    required this.sortMs,
  });

  final String id;
  final String attemptId;
  final String classId;
  final int meetingNo;
  final String uid;
  final String studentName;
  final String studentEmail;
  final String examType;
  final String status;
  final bool examActive;
  final int? examExpiresAtMs;
  final int? score;
  final int? correctCount;
  final int totalQuestions;
  final double pointsPerQuestion;
  final bool passed;
  final int sortMs;

  bool get isSubmitted => status == 'submitted' || score != null;

  bool get isInProgressActive {
    if (isSubmitted) return false;
    final inProg = status == 'in_progress' || examActive;
    if (!inProg) return false;
    if (examExpiresAtMs == null) return true;
    return examExpiresAtMs! > DateTime.now().millisecondsSinceEpoch;
  }

  static int? parseTimestampMs(dynamic raw) {
    if (raw == null) return null;
    if (raw is Timestamp) return raw.millisecondsSinceEpoch;
    if (raw is num) {
      final v = raw.toInt();
      return v > 0 ? v : null;
    }
    if (raw is String && raw.trim().isNotEmpty) {
      final asInt = int.tryParse(raw.trim());
      if (asInt != null && asInt > 0) return asInt;
      final dt = DateTime.tryParse(raw.trim());
      return dt != null && dt.millisecondsSinceEpoch > 0
          ? dt.millisecondsSinceEpoch
          : null;
    }
    return null;
  }

  factory ExamAttempt.fromMap(String id, Map<String, dynamic> map) {
    final rawMeeting = map['meetingNo'];
    final meetingNo = rawMeeting is num
        ? rawMeeting.toInt()
        : int.tryParse(rawMeeting?.toString() ?? '') ?? 1;

    final rawScore = map['score'];
    final parsedScore = rawScore is num
        ? rawScore.toInt()
        : int.tryParse(rawScore?.toString() ?? '');

    final rawCorrect = map['correctCount'];
    final parsedCorrect = rawCorrect is num
        ? rawCorrect.toInt()
        : int.tryParse(rawCorrect?.toString() ?? '');

    final rawTotal = map['totalQuestions'];
    final parsedTotal = rawTotal is num
        ? rawTotal.toInt()
        : int.tryParse(rawTotal?.toString() ?? '') ?? 0;

    final rawPoints = map['pointsPerQuestion'];
    final parsedPoints = rawPoints is num
        ? rawPoints.toDouble()
        : double.tryParse(rawPoints?.toString() ?? '') ??
            ExamDraftStore.computePointsPerQuestion(parsedTotal);

    final examType =
        (map['examType'] ?? '').toString().trim().toLowerCase() == 'posttest'
            ? 'posttest'
            : 'pretest';

    final status = (map['status'] ?? '').toString().trim().toLowerCase();
    final expiresAtMs =
        parseTimestampMs(map['examExpiresAt'] ?? map['expiresAt']);
    final sortMs =
        parseTimestampMs(
          map['submittedAt'] ?? map['updatedAt'] ?? map['examStartedAt'],
        ) ??
        0;

    return ExamAttempt(
      id: id,
      attemptId: (map['attemptId'] ?? id).toString().trim(),
      classId: (map['classId'] ?? '').toString().trim(),
      meetingNo: meetingNo,
      uid: (map['uid'] ?? '').toString().trim(),
      studentName: (map['studentName'] ?? '').toString().trim(),
      studentEmail: (map['studentEmail'] ?? '').toString().trim(),
      examType: examType,
      status: status.isEmpty ? (parsedScore != null ? 'submitted' : 'in_progress') : status,
      examActive: map['examActive'] == true,
      examExpiresAtMs: expiresAtMs,
      score: parsedScore,
      correctCount: parsedCorrect,
      totalQuestions: parsedTotal,
      pointsPerQuestion: parsedPoints,
      passed: map['passed'] == true || (parsedScore != null && parsedScore >= 75),
      sortMs: sortMs,
    );
  }
}

/// Baris rekap perbandingan Gain (`Posttest - Pretest`) per mahasiswa pada satu pertemuan.
class ExamStudentGainRow {
  const ExamStudentGainRow({
    required this.uid,
    required this.displayName,
    required this.email,
    required this.pretestScore,
    required this.posttestScore,
  });

  final String uid;
  final String displayName;
  final String email;
  final int? pretestScore;
  final int? posttestScore;

  int? get gainDelta {
    if (pretestScore == null || posttestScore == null) return null;
    return posttestScore! - pretestScore!;
  }

  /// Menghitung tabel perbandingan Pretest vs Posttest per mahasiswa dengan resolusi
  /// nama lengkap dari `class_members` (selaras `resolveAttemptStudentDisplay` web).
  static List<ExamStudentGainRow> buildGainRows({
    required List<ExamAttempt> attempts,
    required List<ClassMembership> members,
    required int meetingNo,
  }) {
    final memberByUid = <String, ClassMembership>{
      for (final m in members)
        if (m.uid.isNotEmpty) m.uid: m,
    };

    final scoped = attempts.where((a) => a.meetingNo == meetingNo);
    final grouped = <String, ExamStudentGainRow>{};

    for (final att in scoped) {
      final key = att.uid.isNotEmpty ? att.uid : att.id;
      final member = att.uid.isNotEmpty ? memberByUid[att.uid] : null;
      final rawAttName = att.studentName.trim();
      final validAttName =
          rawAttName.isNotEmpty && rawAttName != 'Mahasiswa' ? rawAttName : '';
      final memberLabel = member?.effectiveLabel ?? '';
      final validMemberName =
          memberLabel.isNotEmpty && memberLabel != att.uid && memberLabel != 'Mahasiswa'
              ? memberLabel
              : '';
      final resolvedEmail =
          att.studentEmail.isNotEmpty ? att.studentEmail : (member?.email ?? '');
      final resolvedName = validAttName.isNotEmpty
          ? validAttName
          : (validMemberName.isNotEmpty
                ? validMemberName
                : (resolvedEmail.isNotEmpty ? resolvedEmail : key));

      final prev = grouped[key];
      final nextPretest =
          att.examType == 'pretest' && att.score != null ? att.score : prev?.pretestScore;
      final nextPosttest =
          att.examType == 'posttest' && att.score != null ? att.score : prev?.posttestScore;
      final chosenName = (prev != null &&
              prev.displayName.isNotEmpty &&
              prev.displayName != key)
          ? prev.displayName
          : resolvedName;

      grouped[key] = ExamStudentGainRow(
        uid: key,
        displayName: chosenName,
        email: resolvedEmail.isNotEmpty ? resolvedEmail : (prev?.email ?? ''),
        pretestScore: nextPretest,
        posttestScore: nextPosttest,
      );
    }

    return grouped.values.toList(growable: false);
  }
}
