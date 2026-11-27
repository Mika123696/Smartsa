/// Konfigurasi runtime aplikasi mobile Smartsa LMS.
///
/// Nilai [apiBaseUrl] dapat di-override saat build/run menggunakan flag:
/// `--dart-define=API_BASE_URL=https://domain-anda.vercel.app`
class AppConfig {
  const AppConfig._();

  static const String appName = 'Smartsa LMS';
  static const String defaultApiBaseUrl = 'https://smarta-lms.vercel.app';

  static const String rawApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: defaultApiBaseUrl,
  );

  /// Base URL backend Vercel tanpa trailing slash.
  static String get apiBaseUrl {
    final trimmed = rawApiBaseUrl.trim();
    if (trimmed.isEmpty) return defaultApiBaseUrl;
    return trimmed.endsWith('/')
        ? trimmed.substring(0, trimmed.length - 1)
        : trimmed;
  }

  /// Membangun [Uri] endpoint backend (mis. `/api/bootstrap`, `/api/grade`).
  static Uri apiUri(String path) {
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$apiBaseUrl$normalizedPath');
  }
}
