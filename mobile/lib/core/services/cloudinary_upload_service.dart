import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../utils/url_utils.dart';
import 'api_client.dart';

/// Hasil unggahan berkas ke Cloudinary CDN.
class CloudinaryUploadResult {
  const CloudinaryUploadResult({
    required this.url,
    required this.fileName,
    required this.fileSizeBytes,
    required this.fileSizeLabel,
    required this.mimeType,
    required this.fileType,
  });

  final String url;
  final String fileName;
  final int fileSizeBytes;
  final String fileSizeLabel;
  final String mimeType;
  final String fileType;
}

/// Pengecualian validasi lokal berkas sebelum atau saat upload Cloudinary.
class CloudinaryUploadException implements Exception {
  const CloudinaryUploadException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Layanan unggah berkas aman via signed `/api/upload-sign` lalu multipart
/// langsung ke `https://api.cloudinary.com/v1_1/<cloud_name>/<resource_type>/upload`.
class CloudinaryUploadService {
  CloudinaryUploadService({
    required this.apiClient,
    http.Client? httpClient,
  }) : _httpClient = httpClient ?? http.Client();

  final ApiClient apiClient;
  final http.Client _httpClient;

  static const int maxImageBytes = 5 * 1024 * 1024; // 5 MB
  static const int maxSubmissionBytes = 15 * 1024 * 1024; // 15 MB
  static const int maxDocumentBytes = 25 * 1024 * 1024; // 25 MB

  static const List<String> imageAllowedExtensions = <String>[
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
  ];

  static const List<String> submissionAllowedExtensions = <String>[
    '.pdf',
    '.docx',
    '.zip',
    '.jpg',
    '.jpeg',
    '.png',
  ];

  static const List<String> documentAllowedExtensions = <String>[
    '.pdf',
    '.pptx',
    '.ppt',
    '.docx',
    '.doc',
    '.zip',
    '.fig',
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
  ];

  static const Set<String> submissionAllowedMimeTypes = <String>{
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-zip',
    'image/jpeg',
    'image/jpg',
    'image/png',
  };

  /// Memvalidasi nama berkas, ekstensi, MIME type, dan ukuran berkas sesuai aturan server.
  static void validateFile({
    required String category,
    required String fileName,
    required int fileSize,
    String? mimeType,
  }) {
    final cleanName = fileName.trim();
    if (cleanName.isEmpty ||
        cleanName.contains('/') ||
        cleanName.contains('\\')) {
      throw const CloudinaryUploadException('Nama berkas tidak valid.');
    }

    if (fileSize <= 0) {
      throw const CloudinaryUploadException(
        'Berkas kosong (0 byte) tidak dapat diunggah.',
      );
    }

    final lowerName = cleanName.toLowerCase();
    final lowerMime = (mimeType ?? '').trim().toLowerCase();
    final normalizedCat = category.trim().toLowerCase();

    if (normalizedCat == 'submission') {
      final validExt = submissionAllowedExtensions.any(lowerName.endsWith);
      if (!validExt) {
        throw CloudinaryUploadException(
          'Format berkas tugas tidak diizinkan. Gunakan: ${submissionAllowedExtensions.join(', ')}',
        );
      }
      if (lowerMime.isNotEmpty &&
          lowerMime != 'application/octet-stream' &&
          !submissionAllowedMimeTypes.contains(lowerMime)) {
        throw const CloudinaryUploadException(
          'Tipe MIME berkas pengumpulan tugas tidak diizinkan.',
        );
      }
      if (fileSize > maxSubmissionBytes) {
        throw const CloudinaryUploadException(
          'Ukuran berkas tugas melebihi batas maksimum (15 MB).',
        );
      }
      return;
    }

    if (normalizedCat == 'image') {
      final validExt = imageAllowedExtensions.any(lowerName.endsWith);
      if (!validExt) {
        throw CloudinaryUploadException(
          'Format gambar tidak diizinkan. Gunakan: ${imageAllowedExtensions.join(', ')}',
        );
      }
      if (fileSize > maxImageBytes) {
        throw const CloudinaryUploadException(
          'Ukuran gambar melebihi batas maksimum (5 MB).',
        );
      }
      return;
    }

    if (normalizedCat == 'document') {
      final validExt = documentAllowedExtensions.any(lowerName.endsWith);
      if (!validExt) {
        throw CloudinaryUploadException(
          'Format dokumen tidak diizinkan. Gunakan: ${documentAllowedExtensions.join(', ')}',
        );
      }
      if (fileSize > maxDocumentBytes) {
        throw const CloudinaryUploadException(
          'Ukuran dokumen melebihi batas maksimum (25 MB).',
        );
      }
      return;
    }

    throw const CloudinaryUploadException('Kategori unggah berkas tidak valid.');
  }

  /// Mendeteksi tipe ringkas berkas untuk badge UI (`pdf`, `pptx`, `docx`, `archive`, `image`, `file`).
  static String detectMaterialFileType(String fileName, [String mimeType = '']) {
    final lowerName = fileName.trim().toLowerCase();
    final lowerMime = mimeType.trim().toLowerCase();

    if (lowerMime.startsWith('image/') ||
        <String>['.jpg', '.jpeg', '.png', '.webp', '.gif']
            .any(lowerName.endsWith)) {
      return 'image';
    }
    if (lowerMime == 'application/pdf' || lowerName.endsWith('.pdf')) {
      return 'pdf';
    }
    if (lowerMime.contains('presentationml') ||
        lowerMime.contains('ms-powerpoint') ||
        lowerName.endsWith('.pptx') ||
        lowerName.endsWith('.ppt')) {
      return 'pptx';
    }
    if (lowerMime.contains('wordprocessingml') ||
        lowerMime == 'application/msword' ||
        lowerName.endsWith('.docx') ||
        lowerName.endsWith('.doc')) {
      return 'docx';
    }
    if (lowerMime.contains('zip') || lowerName.endsWith('.zip')) {
      return 'archive';
    }
    return 'file';
  }

  /// Memformat ukuran byte menjadi label MB / KB yang rapi.
  static String formatFileSize(int bytes) {
    if (bytes <= 0) return '0 KB';
    if (bytes >= 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} MB';
    }
    return '${(bytes / 1024).ceil()} KB';
  }

  /// Menebak MIME type dasar dari ekstensi berkas bila platform tidak menyertakannya.
  static String inferMimeType(String fileName, [String? providedMime]) {
    final clean = (providedMime ?? '').trim().toLowerCase();
    if (clean.isNotEmpty) return clean;
    final lower = fileName.trim().toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.docx')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (lower.endsWith('.doc')) return 'application/msword';
    if (lower.endsWith('.pptx')) {
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }
    if (lower.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
    if (lower.endsWith('.zip')) return 'application/zip';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'application/octet-stream';
  }

  /// Mengunggah berkas secara aman menggunakan signature dari `/api/upload-sign`.
  Future<CloudinaryUploadResult> uploadFile({
    required String category,
    required String fileName,
    required int fileSize,
    Uint8List? bytes,
    String? filePath,
    String? mimeType,
    String? classId,
    String? assignmentId,
  }) async {
    final resolvedMime = inferMimeType(fileName, mimeType);
    validateFile(
      category: category,
      fileName: fileName,
      fileSize: fileSize,
      mimeType: resolvedMime,
    );

    if (category == 'submission' &&
        ((classId ?? '').trim().isEmpty ||
            (assignmentId ?? '').trim().isEmpty)) {
      throw const CloudinaryUploadException(
        'classId dan assignmentId wajib tersedia untuk mengunggah tugas.',
      );
    }

    if (bytes == null && (filePath == null || filePath.trim().isEmpty)) {
      throw const CloudinaryUploadException(
        'Konten berkas tidak terbaca dari perangkat.',
      );
    }

    final signData = await apiClient.postUploadSign(
      category: category,
      classId: classId,
      assignmentId: assignmentId,
      fileName: fileName.trim(),
      mimeType: resolvedMime,
      fileSize: fileSize,
    );

    final cloudName = (signData['cloud_name'] ?? '').toString().trim();
    final apiKey = (signData['api_key'] ?? '').toString().trim();
    final signature = (signData['signature'] ?? '').toString().trim();
    final timestamp = (signData['timestamp'] ?? '').toString().trim();
    final folder = (signData['folder'] ?? '').toString().trim();

    if (cloudName.isEmpty ||
        apiKey.isEmpty ||
        signature.isEmpty ||
        timestamp.isEmpty) {
      throw const CloudinaryUploadException(
        'Respons signature Cloudinary dari server tidak lengkap.',
      );
    }

    final resourceType = category == 'image' ? 'image' : 'auto';
    final uploadUri = Uri.parse(
      'https://api.cloudinary.com/v1_1/$cloudName/$resourceType/upload',
    );

    final request = http.MultipartRequest('POST', uploadUri)
      ..fields['api_key'] = apiKey
      ..fields['timestamp'] = timestamp
      ..fields['signature'] = signature;

    if (folder.isNotEmpty) {
      request.fields['folder'] = folder;
    }

    if (bytes != null) {
      request.files.add(
        http.MultipartFile.fromBytes('file', bytes, filename: fileName.trim()),
      );
    } else {
      request.files.add(
        await http.MultipartFile.fromPath(
          'file',
          filePath!.trim(),
          filename: fileName.trim(),
        ),
      );
    }

    final streamedResponse = await _httpClient.send(request);
    final response = await http.Response.fromStream(streamedResponse);

    Map<String, dynamic> decoded = <String, dynamic>{};
    if (response.body.trim().isNotEmpty) {
      try {
        final raw = jsonDecode(response.body);
        if (raw is Map<String, dynamic>) {
          decoded = raw;
        }
      } catch (_) {}
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final errObj = decoded['error'];
      final cloudMsg = errObj is Map
          ? errObj['message']?.toString()
          : errObj?.toString();
      throw CloudinaryUploadException(
        (cloudMsg != null && cloudMsg.trim().isNotEmpty)
            ? cloudMsg.trim()
            : 'Gagal mengunggah berkas ke Cloudinary (HTTP ${response.statusCode}).',
      );
    }

    final secureUrl = UrlUtils.sanitizeSafeUrl(
      decoded['secure_url']?.toString(),
      requireHttps: true,
    );
    if (secureUrl == null) {
      throw const CloudinaryUploadException(
        'Cloudinary tidak mengembalikan URL HTTPS yang valid.',
      );
    }

    return CloudinaryUploadResult(
      url: secureUrl,
      fileName: fileName.trim(),
      fileSizeBytes: fileSize,
      fileSizeLabel: formatFileSize(fileSize),
      mimeType: resolvedMime,
      fileType: detectMaterialFileType(fileName, resolvedMime),
    );
  }
}
