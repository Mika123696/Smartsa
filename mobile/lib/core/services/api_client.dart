import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import '../config/app_config.dart';

/// Pengecualian terstruktur untuk seluruh respons gagal dari backend `/api/*`.
class ApiException implements Exception {
  const ApiException({
    required this.statusCode,
    required this.message,
    this.code = 'API_ERROR',
    this.retryAfterSeconds,
  });

  final int statusCode;
  final String code;
  final String message;
  final int? retryAfterSeconds;

  @override
  String toString() => 'ApiException($statusCode, $code): $message';
}

/// Client HTTP stateless menuju backend serverless Vercel `/api/*`.
///
/// Selalu menyematkan `Authorization: Bearer <Firebase ID Token>` dan tidak
/// mengirim header `Origin` browser.
class ApiClient {
  ApiClient({
    http.Client? httpClient,
    this._tokenProvider,
    String? baseUrl,
  }) : _httpClient = httpClient ?? http.Client(),
       _baseUrl = _normalizeBaseUrl(baseUrl ?? AppConfig.apiBaseUrl);

  final http.Client _httpClient;
  final Future<String?> Function()? _tokenProvider;
  final String _baseUrl;

  static String _normalizeBaseUrl(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return AppConfig.defaultApiBaseUrl;
    return trimmed.endsWith('/')
        ? trimmed.substring(0, trimmed.length - 1)
        : trimmed;
  }

  Uri _buildUri(String path) {
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$_baseUrl$normalizedPath');
  }

  Future<String> _requireIdToken() async {
    String? token;
    if (_tokenProvider != null) {
      token = await _tokenProvider();
    } else {
      token = await FirebaseAuth.instance.currentUser?.getIdToken();
    }

    final trimmed = token?.trim() ?? '';
    if (trimmed.isEmpty) {
      throw const ApiException(
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Sesi autentikasi tidak aktif. Silakan masuk kembali.',
      );
    }
    return trimmed;
  }

  Map<String, String> _buildHeaders(String idToken, {required bool isPost}) {
    return <String, String>{
      'Authorization': 'Bearer $idToken',
      'Accept': 'application/json',
      if (isPost) 'Content-Type': 'application/json',
    };
  }

  Future<Map<String, dynamic>> _get(String path) async {
    final token = await _requireIdToken();
    try {
      final response = await _httpClient.get(
        _buildUri(path),
        headers: _buildHeaders(token, isPost: false),
      );
      return _decodeResponse(response);
    } on ApiException {
      rethrow;
    } catch (err) {
      throw ApiException(
        statusCode: 0,
        code: 'NETWORK_ERROR',
        message: 'Gagal terhubung ke server Smartsa: $err',
      );
    }
  }

  Future<Map<String, dynamic>> _post(
    String path, [
    Map<String, dynamic>? body,
  ]) async {
    final token = await _requireIdToken();
    try {
      final response = await _httpClient.post(
        _buildUri(path),
        headers: _buildHeaders(token, isPost: true),
        body: jsonEncode(body ?? const <String, dynamic>{}),
      );
      return _decodeResponse(response);
    } on ApiException {
      rethrow;
    } catch (err) {
      throw ApiException(
        statusCode: 0,
        code: 'NETWORK_ERROR',
        message: 'Gagal terhubung ke server Smartsa: $err',
      );
    }
  }

  Map<String, dynamic> _decodeResponse(http.Response response) {
    Map<String, dynamic>? parsedBody;
    if (response.body.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(response.body);
        if (decoded is Map<String, dynamic>) {
          parsedBody = decoded;
        }
      } catch (_) {
        parsedBody = null;
      }
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return parsedBody ?? <String, dynamic>{};
    }

    final rawRetry =
        parsedBody?['retryAfterSeconds'] ?? response.headers['retry-after'];
    final retrySeconds = int.tryParse(rawRetry?.toString() ?? '');
    final code = (parsedBody?['code'] ?? _defaultErrorCode(response.statusCode))
        .toString();
    final serverMessage = parsedBody?['error']?.toString().trim();

    throw ApiException(
      statusCode: response.statusCode,
      code: code,
      retryAfterSeconds: retrySeconds,
      message: (serverMessage != null && serverMessage.isNotEmpty)
          ? serverMessage
          : _defaultErrorMessage(response.statusCode, retrySeconds),
    );
  }

  static String _defaultErrorCode(int statusCode) {
    switch (statusCode) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 413:
        return 'PAYLOAD_TOO_LARGE';
      case 429:
        return 'RATE_LIMIT_EXCEEDED';
      case 502:
        return 'BAD_GATEWAY';
      case 503:
        return 'SERVICE_UNAVAILABLE';
      default:
        return 'HTTP_$statusCode';
    }
  }

  static String _defaultErrorMessage(int statusCode, int? retrySeconds) {
    switch (statusCode) {
      case 400:
        return 'Permintaan tidak valid. Periksa kembali data yang dikirim.';
      case 401:
        return 'Sesi autentikasi tidak valid atau kedaluwarsa. Silakan masuk ulang.';
      case 403:
        return 'Akses ditolak untuk aksi atau peran Anda saat ini.';
      case 404:
        return 'Data atau endpoint yang diminta tidak ditemukan.';
      case 429:
        final waitNote =
            retrySeconds != null ? ' Coba lagi dalam $retrySeconds detik.' : '';
        return 'Terlalu banyak permintaan.$waitNote';
      case 502:
        return 'Server mengalami gangguan saat menghubungi layanan upstream (502).';
      case 503:
        return 'Layanan server terkait belum terkonfigurasi atau sedang tidak tersedia (503).';
      default:
        return 'Terjadi kesalahan server (HTTP $statusCode).';
    }
  }

  /// Sinkronisasi profil, peran, dan status MFA pengguna.
  Future<Map<String, dynamic>> postBootstrap([
    Map<String, dynamic>? payload,
  ]) {
    return _post('/api/bootstrap', payload);
  }

  /// Mengecek status kesiapan Firestore, Cloudinary, dan Gemini AI di server.
  Future<Map<String, dynamic>> getHealth() {
    return _get('/api/health');
  }

  /// Operasi MFA TOTP (`status`, `setup`, `confirm`, `verify`, `disable`).
  Future<Map<String, dynamic>> postMfa(
    String action, [
    Map<String, dynamic>? payload,
  ]) {
    return _post('/api/mfa', <String, dynamic>{
      'action': action,
      ...?payload,
    });
  }

  /// Mendaftarkan mahasiswa ke kelas menggunakan kode kelas 6–12 karakter.
  Future<Map<String, dynamic>> postJoinClass(String classCode) {
    return _post('/api/join-class', <String, dynamic>{
      'classCode': classCode.trim().toUpperCase(),
    });
  }

  /// Mengirim pertanyaan ke asisten AI Smartsa (siap dipakai Tahap 3).
  Future<Map<String, dynamic>> postAi({
    required String prompt,
    String mode = 'learning',
    String context = '',
    List<Map<String, String>> history = const <Map<String, String>>[],
    bool isExamActive = false,
  }) {
    return _post('/api/ai', <String, dynamic>{
      'mode': mode,
      'prompt': prompt,
      'context': context,
      'history': history,
      'isExamActive': isExamActive,
    });
  }

  /// Meminta signature aman Cloudinary (siap dipakai Tahap 3/4).
  Future<Map<String, dynamic>> postUploadSign({
    required String category,
    String? classId,
    String? assignmentId,
    String? fileName,
    String? mimeType,
    int? fileSize,
  }) {
    return _post('/api/upload-sign', <String, dynamic>{
      'category': category,
      'classId': ?classId,
      'assignmentId': ?assignmentId,
      'fileName': ?fileName,
      'mimeType': ?mimeType,
      'fileSize': ?fileSize,
    });
  }

  /// Mengelola evaluasi & penilaian ujian server-side (`/api/grade`).
  Future<Map<String, dynamic>> postGrade(Map<String, dynamic> payload) {
    return _post('/api/grade', payload);
  }

  /// Memulai atau melanjutkan sesi Pretest/Posttest siswa via `POST /api/grade`.
  Future<Map<String, dynamic>> postStartExam({
    required String classId,
    required int meetingNo,
    required String examType,
  }) {
    return postGrade(<String, dynamic>{
      'action': 'start',
      'classId': classId.trim(),
      'meetingNo': meetingNo,
      'examType': examType == 'posttest' ? 'posttest' : 'pretest',
    });
  }

  /// Mengumpulkan jawaban evaluasi siswa untuk dinilai server-side via `POST /api/grade`.
  Future<Map<String, dynamic>> postSubmitExam({
    required String classId,
    required int meetingNo,
    required String examType,
    required Map<String, int> answers,
  }) {
    return postGrade(<String, dynamic>{
      'action': 'submit',
      'classId': classId.trim(),
      'meetingNo': meetingNo,
      'examType': examType == 'posttest' ? 'posttest' : 'pretest',
      'answers': answers,
    });
  }

  /// Memuat kunci jawaban referensi khusus dosen pengampu/admin via `POST /api/grade`.
  Future<Map<String, dynamic>> postInstructorExamKeys({
    required String classId,
    required int meetingNo,
    required String examType,
  }) {
    return postGrade(<String, dynamic>{
      'action': 'instructor_keys',
      'classId': classId.trim(),
      'meetingNo': meetingNo,
      'examType': examType == 'posttest' ? 'posttest' : 'pretest',
    });
  }

  /// Menyimpan soal & kunci jawaban evaluasi oleh dosen/admin via `POST /api/grade`.
  Future<Map<String, dynamic>> postSaveExam({
    required String classId,
    required int meetingNo,
    required String examType,
    required String title,
    required String status,
    required int durationMinutes,
    String? deadline,
    required List<Map<String, dynamic>> questions,
    required Map<String, int> answerKey,
  }) {
    final cleanDeadline = deadline?.trim() ?? '';
    return postGrade(<String, dynamic>{
      'action': 'save_exam',
      'classId': classId.trim(),
      'meetingNo': meetingNo,
      'examType': examType == 'posttest' ? 'posttest' : 'pretest',
      'title': title.trim(),
      'status': status.trim().toLowerCase(),
      'durationMinutes': durationMinutes,
      'deadline': cleanDeadline.isEmpty ? null : cleanDeadline,
      'questions': questions,
      'answerKey': answerKey,
    });
  }

  /// Mengarsipkan evaluasi pertemuan oleh dosen/admin via `POST /api/grade`.
  Future<Map<String, dynamic>> postArchiveExam({
    required String classId,
    required int meetingNo,
    required String examType,
  }) {
    return postGrade(<String, dynamic>{
      'action': 'archive_exam',
      'classId': classId.trim(),
      'meetingNo': meetingNo,
      'examType': examType == 'posttest' ? 'posttest' : 'pretest',
    });
  }

  /// Menghapus evaluasi & kunci terkait oleh dosen/admin via `POST /api/grade`.
  Future<Map<String, dynamic>> postDeleteExam({
    required String classId,
    required int meetingNo,
    required String examType,
  }) {
    return postGrade(<String, dynamic>{
      'action': 'delete_exam',
      'classId': classId.trim(),
      'meetingNo': meetingNo,
      'examType': examType == 'posttest' ? 'posttest' : 'pretest',
    });
  }

  /// Mengelola persetujuan/penghapusan anggota kelas oleh dosen/admin (siap dipakai Tahap 4).
  Future<Map<String, dynamic>> postManageMembers({
    required String action,
    required String classId,
    required String memberUid,
  }) {
    return _post('/api/manage-members', <String, dynamic>{
      'action': action,
      'classId': classId,
      'memberUid': memberUid,
    });
  }
}
