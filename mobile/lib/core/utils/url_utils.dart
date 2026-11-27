import 'dart:convert';

import 'package:url_launcher/url_launcher.dart';

/// Utilitas validasi URL aman (`https://`/`http://`), normalisasi tautan YouTube,
/// dan konversi fallback Delta JSON (`{ ops: [...] }`) ke teks baca-saja.
class UrlUtils {
  const UrlUtils._();

  /// Memvalidasi apakah [rawUrl] aman dibuka/disimpan (menolak `javascript:`,
  /// `data:`, `blob:`, `file:`, spasi, `<`, `>`, dan host kosong).
  static bool isSafeHttpUrl(String? rawUrl, {bool requireHttps = false}) {
    if (rawUrl == null) return false;
    final trimmed = rawUrl.trim();
    if (trimmed.isEmpty || RegExp(r'[\s<>]').hasMatch(trimmed)) {
      return false;
    }

    final Uri? parsed = Uri.tryParse(trimmed);
    if (parsed == null || !parsed.hasScheme || parsed.host.trim().isEmpty) {
      return false;
    }

    final scheme = parsed.scheme.toLowerCase();
    if (requireHttps) {
      return scheme == 'https';
    }
    return scheme == 'https' || scheme == 'http';
  }

  /// Mengembalikan URL yang sudah tervalidasi atau `null` jika tidak aman.
  static String? sanitizeSafeUrl(String? rawUrl, {bool requireHttps = false}) {
    if (!isSafeHttpUrl(rawUrl, requireHttps: requireHttps)) {
      return null;
    }
    return rawUrl!.trim();
  }

  /// Mengekstrak ID video YouTube dari URL `watch?v=`, `youtu.be/`, `/shorts/`,
  /// `/live/`, atau `/embed/`.
  static String? extractYouTubeVideoId(String? rawUrl) {
    final safe = sanitizeSafeUrl(rawUrl);
    if (safe == null) return null;

    final uri = Uri.parse(safe);
    final host = uri.host.toLowerCase();

    if (host == 'youtu.be') {
      final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
      return segments.isNotEmpty ? _sanitizeVideoId(segments.first) : null;
    }

    if (host == 'youtube.com' || host.endsWith('.youtube.com')) {
      final vParam = uri.queryParameters['v'];
      if (vParam != null && vParam.trim().isNotEmpty) {
        return _sanitizeVideoId(vParam);
      }

      final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
      if (segments.length >= 2 &&
          (segments[0] == 'shorts' ||
              segments[0] == 'live' ||
              segments[0] == 'embed')) {
        return _sanitizeVideoId(segments[1]);
      }
    }

    return null;
  }

  static String? _sanitizeVideoId(String rawId) {
    final clean = rawId.trim();
    if (clean.isEmpty || !RegExp(r'^[a-zA-Z0-9_-]{4,32}$').hasMatch(clean)) {
      return null;
    }
    return clean;
  }

  /// Menormalisasi URL YouTube (`watch`, `youtu.be`, `shorts`, `live`, `embed`)
  /// ke URL kanonik `https://www.youtube.com/watch?v=<id>`.
  static String? normalizeYouTubeUrl(String? rawUrl) {
    final videoId = extractYouTubeVideoId(rawUrl);
    if (videoId == null) return null;
    return 'https://www.youtube.com/watch?v=$videoId';
  }

  /// Menghasilkan URL embed YouTube `https://www.youtube.com/embed/<id>` bila valid.
  static String? normalizeYouTubeEmbedUrl(String? rawUrl) {
    final videoId = extractYouTubeVideoId(rawUrl);
    if (videoId == null) return null;
    return 'https://www.youtube.com/embed/$videoId';
  }

  /// Menormalisasi tautan video pembelajaran secara umum (YouTube atau HTTP/HTTPS aman).
  static String? resolvePlayableVideoUrl(String? rawUrl) {
    final yt = normalizeYouTubeUrl(rawUrl);
    if (yt != null) return yt;
    return sanitizeSafeUrl(rawUrl);
  }

  /// Membuka URL aman di browser / aplikasi eksternal via `url_launcher`.
  static Future<bool> launchSafeExternalUrl(
    String? rawUrl, {
    bool requireHttps = false,
  }) async {
    final safe = sanitizeSafeUrl(rawUrl, requireHttps: requireHttps);
    if (safe == null) return false;
    final uri = Uri.parse(safe);
    return launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  /// Mengonversi objek Quill Delta JSON legacy (`{ "ops": [...] }`) ke teks
  /// baca-saja yang bersih untuk ditampilkan di tab Materi & Video.
  static String deltaContentToPlainText(dynamic delta) {
    if (delta == null) return '';

    dynamic normalized = delta;
    if (normalized is String) {
      final trimmed = normalized.trim();
      if (trimmed.isEmpty) return '';
      try {
        normalized = jsonDecode(trimmed);
      } catch (_) {
        return trimmed;
      }
    }

    List<dynamic>? ops;
    if (normalized is Map<String, dynamic> && normalized['ops'] is List) {
      ops = normalized['ops'] as List<dynamic>;
    } else if (normalized is Map && normalized['ops'] is List) {
      ops = normalized['ops'] as List<dynamic>;
    } else if (normalized is List) {
      ops = normalized;
    }

    if (ops == null || ops.isEmpty) return '';

    final buffer = StringBuffer();
    for (final op in ops) {
      if (op is! Map) continue;
      final insert = op['insert'];
      if (insert is String) {
        buffer.write(insert);
      } else if (insert is Map && insert['image'] is String) {
        final imageUrl = sanitizeSafeUrl(
          insert['image'] as String?,
          requireHttps: true,
        );
        if (imageUrl != null) {
          buffer.write('\n[Gambar: $imageUrl]\n');
        }
      }
    }

    return buffer.toString().trim();
  }
}
