import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Utilitas perhitungan bobot skor evaluasi serta penyimpanan draf jawaban lokal ujian
/// pada [SharedPreferences] berbasis `(uid, classId, meetingNo, examType)`.
class ExamDraftStore {
  const ExamDraftStore._();

  /// Menghitung bobot skor rata per soal (`100 / jumlahSoal`, 2 desimal; selaras server `api/index.js`).
  static double computePointsPerQuestion(int totalQuestions) {
    if (totalQuestions <= 0) return 0;
    return double.parse((100 / totalQuestions).toStringAsFixed(2));
  }

  /// Membangun key penyimpanan draf unik untuk satu percobaan ujian mahasiswa.
  static String buildStorageKey({
    required String classId,
    required int meetingNo,
    required String examType,
    required String uid,
  }) {
    final cleanClassId = classId.trim();
    final cleanUid = uid.trim();
    if (cleanClassId.isEmpty || cleanUid.isEmpty) return '';
    final safeType = examType == 'posttest' ? 'posttest' : 'pretest';
    final safeMeetingNo = meetingNo < 1 ? 1 : meetingNo;
    return 'smartsa_exam_draft_${cleanClassId}_m${safeMeetingNo}_${safeType}_$cleanUid';
  }

  /// Memuat draf jawaban tersimpan `{ questionId: selectedOptionIndex }`.
  static Future<Map<String, int>> readDraftAnswers({
    required String classId,
    required int meetingNo,
    required String examType,
    required String uid,
  }) async {
    final key = buildStorageKey(
      classId: classId,
      meetingNo: meetingNo,
      examType: examType,
      uid: uid,
    );
    if (key.isEmpty) return <String, int>{};
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(key);
      if (raw == null || raw.trim().isEmpty) return <String, int>{};
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return <String, int>{};
      final result = <String, int>{};
      for (final entry in decoded.entries) {
        final qId = entry.key.toString().trim();
        final idx = entry.value is num
            ? (entry.value as num).toInt()
            : int.tryParse(entry.value?.toString() ?? '');
        if (qId.isNotEmpty && idx != null && idx >= 0) {
          result[qId] = idx;
        }
      }
      return result;
    } catch (_) {
      return <String, int>{};
    }
  }

  /// Menyimpan draf jawaban ujian lokal secara asinkron.
  static Future<void> writeDraftAnswers({
    required String classId,
    required int meetingNo,
    required String examType,
    required String uid,
    required Map<String, int> answers,
  }) async {
    final key = buildStorageKey(
      classId: classId,
      meetingNo: meetingNo,
      examType: examType,
      uid: uid,
    );
    if (key.isEmpty) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(key, jsonEncode(answers));
    } catch (_) {}
  }

  /// Menghapus draf jawaban lokal setelah pengumpulan `/api/grade` berhasil.
  static Future<void> clearDraftAnswers({
    required String classId,
    required int meetingNo,
    required String examType,
    required String uid,
  }) async {
    final key = buildStorageKey(
      classId: classId,
      meetingNo: meetingNo,
      examType: examType,
      uid: uid,
    );
    if (key.isEmpty) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(key);
    } catch (_) {}
  }
}
