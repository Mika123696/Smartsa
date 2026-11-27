import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';

import '../services/cloudinary_upload_service.dart';

/// Berkas hasil pemilihan lokal yang siap diunggah ke Cloudinary.
class PickedUploadFile {
  const PickedUploadFile({
    required this.name,
    required this.fileSize,
    required this.bytes,
    this.filePath,
  });

  final String name;
  final int fileSize;
  final Uint8List bytes;
  final String? filePath;

  String get sizeLabel => CloudinaryUploadService.formatFileSize(fileSize);
}

/// Berkas teks lokal (`.txt`) yang dibaca langsung untuk import format Aiken.
class PickedTextFile {
  const PickedTextFile({
    required this.name,
    required this.fileSize,
    required this.content,
  });

  final String name;
  final int fileSize;
  final String content;

  String get sizeLabel => CloudinaryUploadService.formatFileSize(fileSize);
}

/// Membuka pemilih berkas [FilePicker.pickFile] (`file_picker` ^13.4.x),
/// memvalidasi ekstensi/ukuran sesuai [category], lalu membaca byte berkas
/// agar kompatibel dengan Android SAF `content://` URI maupun file path.
Future<PickedUploadFile?> pickAndValidateUploadFile({
  required String category,
  required List<String> allowedExtensions,
  String? mimeType,
}) async {
  final picked = await FilePicker.pickFile(
    type: FileType.custom,
    allowedExtensions: allowedExtensions,
  );
  if (picked == null) return null;

  final knownSize = picked.lengthSync() ?? await picked.length();
  if (knownSize != null) {
    CloudinaryUploadService.validateFile(
      category: category,
      fileName: picked.name,
      fileSize: knownSize,
      mimeType: mimeType,
    );
  }

  final bytes = await picked.readAsBytes();
  final resolvedSize = bytes.length;
  CloudinaryUploadService.validateFile(
    category: category,
    fileName: picked.name,
    fileSize: resolvedSize,
    mimeType: mimeType,
  );

  return PickedUploadFile(
    name: picked.name,
    fileSize: resolvedSize,
    bytes: bytes,
    filePath: picked.path,
  );
}

/// Membuka pemilih berkas `.txt` lokal untuk keperluan import soal format Aiken.
Future<PickedTextFile?> pickLocalTextFile({
  int maxBytes = 2 * 1024 * 1024,
}) async {
  final picked = await FilePicker.pickFile(
    type: FileType.custom,
    allowedExtensions: const <String>['txt'],
  );
  if (picked == null) return null;

  final lowerName = picked.name.trim().toLowerCase();
  if (!lowerName.endsWith('.txt')) {
    throw const FormatException('Berkas import Aiken harus berekstensi .txt.');
  }

  final knownSize = picked.lengthSync() ?? await picked.length();
  if (knownSize != null && knownSize > maxBytes) {
    throw const FormatException('Ukuran berkas .txt melebihi batas 2 MB.');
  }

  final bytes = await picked.readAsBytes();
  if (bytes.isEmpty) {
    throw const FormatException('Berkas .txt kosong (0 byte).');
  }
  if (bytes.length > maxBytes) {
    throw const FormatException('Ukuran berkas .txt melebihi batas 2 MB.');
  }

  final content = utf8.decode(bytes, allowMalformed: true);
  return PickedTextFile(
    name: picked.name.trim(),
    fileSize: bytes.length,
    content: content,
  );
}
