import 'package:cloud_firestore/cloud_firestore.dart';

/// Dokumen panduan global pada koleksi `manual_books/{bookId}`.
class ManualBookItem {
  const ManualBookItem({
    required this.id,
    required this.title,
    required this.description,
    required this.fileUrl,
    required this.fileName,
    required this.fileSize,
    required this.storageType,
    required this.uploadedBy,
    required this.uploadedByName,
    required this.createdAtLabel,
    this.sortMs = 0,
  });

  final String id;
  final String title;
  final String description;
  final String fileUrl;
  final String fileName;
  final String fileSize;
  final String storageType;
  final String uploadedBy;
  final String uploadedByName;
  final String createdAtLabel;
  final int sortMs;

  factory ManualBookItem.fromMap(String id, Map<String, dynamic> map) {
    return ManualBookItem(
      id: id,
      title: (map['title'] ?? 'Manual Book Smartsa').toString().trim(),
      description: (map['description'] ?? '').toString().trim(),
      fileUrl: (map['fileUrl'] ?? '').toString().trim(),
      fileName: (map['fileName'] ?? '').toString().trim(),
      fileSize: (map['fileSize'] ?? '').toString().trim(),
      storageType: (map['storageType'] ?? 'cloudinary').toString().trim(),
      uploadedBy: (map['uploadedBy'] ?? '').toString().trim(),
      uploadedByName:
          (map['uploadedByName'] ?? 'Dosen / Admin').toString().trim(),
      createdAtLabel:
          (map['createdAtLabel'] ?? 'Tercatat di Firestore').toString().trim(),
      sortMs: _toMillis(map['createdAt'] ?? map['updatedAt']),
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
