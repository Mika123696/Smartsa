import 'dart:convert';

/// Utilitas bersama untuk membangun, mengekstrak, dan memvalidasi payload QR Presensi Smartsa LMS
/// yang sinkron 1:1 dengan `web/src/services/attendanceService.js`.
class AttendanceQrUtils {
  const AttendanceQrUtils._();

  static final RegExp _prefixPattern = RegExp(
    r'^SMARTSA_QR\s*:\s*([A-Za-z0-9_-]+)$',
    caseSensitive: false,
  );

  static final RegExp _httpPattern = RegExp(
    r'^https?://',
    caseSensitive: false,
  );

  static final RegExp _nonCodeChars = RegExp(r'[^A-Z0-9-]');
  static final RegExp _validSessionCodePattern = RegExp(
    r'^[A-Z0-9][A-Z0-9_-]{2,47}$',
  );

  /// Membangun string payload QR standar Smartsa (`SMARTSA_QR:<KODE>`).
  static String buildPayload(String sessionCode) {
    final clean = sessionCode.trim().toUpperCase();
    return clean.isEmpty ? '' : 'SMARTSA_QR:$clean';
  }

  /// Mengekstrak kode sesi dari berbagai format QR maupun input manual:
  /// 1. Prefiks `SMARTSA_QR:<KODE>`
  /// 2. JSON `{"sessionCode":"..."}` atau `{"code":"..."}`
  /// 3. URL query `?sessionCode=...` atau `?code=...`
  /// 4. Kode sesi mentah langsung
  ///
  /// Mengembalikan string kosong `''` jika input tidak valid / tidak mengandung kode sesi.
  static String parsePayload(String? rawInput) {
    if (rawInput == null) return '';
    final trimmed = rawInput.trim();
    if (trimmed.isEmpty) return '';

    // 1. Payload prefiks standar Smartsa: "SMARTSA_QR:<KODE>"
    final prefixMatch = _prefixPattern.firstMatch(trimmed);
    if (prefixMatch != null && prefixMatch.group(1) != null) {
      return prefixMatch.group(1)!.trim().toUpperCase();
    }

    // 2. Payload JSON terstruktur
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        final decoded = jsonDecode(trimmed);
        if (decoded is Map<String, dynamic>) {
          final candidate =
              (decoded['sessionCode'] ?? decoded['code'] ?? '').toString().trim();
          if (candidate.isNotEmpty) {
            return candidate.toUpperCase();
          }
          return '';
        }
      } catch (_) {
        return '';
      }
    }

    // 3. URL query string (?sessionCode=<KODE> atau ?code=<KODE>)
    if (_httpPattern.hasMatch(trimmed)) {
      final parsedUri = Uri.tryParse(trimmed);
      if (parsedUri != null) {
        final paramCode =
            (parsedUri.queryParameters['sessionCode'] ??
                    parsedUri.queryParameters['code'] ??
                    '')
                .trim();
        if (paramCode.isNotEmpty) {
          return paramCode.toUpperCase();
        }
      }
      return '';
    }

    // 4. Reject strings that still have internal whitespace or invalid scheme prefixes (e.g. javascript:)
    if (trimmed.contains(':') || RegExp(r'\s').hasMatch(trimmed)) {
      return '';
    }

    // 5. Kode sesi mentah langsung
    final cleaned = trimmed.toUpperCase().replaceAll(_nonCodeChars, '');
    if (cleaned != trimmed.toUpperCase()) {
      return '';
    }
    return isValidSessionCode(cleaned) ? cleaned : '';
  }

  /// Memvalidasi apakah [code] memenuhi format kode sesi presensi yang aman.
  static bool isValidSessionCode(String? code) {
    final clean = (code ?? '').trim().toUpperCase();
    if (!_validSessionCodePattern.hasMatch(clean)) return false;
    return RegExp(r'[A-Z0-9]').hasMatch(clean);
  }
}
