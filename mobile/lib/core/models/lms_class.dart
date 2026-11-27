import '../utils/url_utils.dart';

/// Berkas materi pertemuan dalam array `meetings[].materialFiles`.
class MaterialFileItem {
  const MaterialFileItem({
    required this.id,
    required this.title,
    required this.description,
    required this.fileUrl,
    required this.fileName,
    required this.fileType,
    required this.fileSize,
    required this.storageType,
    this.mimeType = '',
    this.uploadedAt = '',
  });

  final String id;
  final String title;
  final String description;
  final String fileUrl;
  final String fileName;
  final String fileType;
  final String fileSize;
  final String storageType;
  final String mimeType;
  final String uploadedAt;

  String get displayName => title.isNotEmpty ? title : fileName;

  Map<String, dynamic> toMap() {
    return <String, dynamic>{
      'id': id,
      'title': title,
      'description': description,
      'fileUrl': fileUrl,
      'fileName': fileName,
      'fileType': fileType,
      'mimeType': mimeType,
      'fileSize': fileSize,
      'storageType': storageType,
      'uploadedAt': uploadedAt,
    };
  }

  factory MaterialFileItem.fromMap(Map<String, dynamic> map) {
    return MaterialFileItem(
      id: (map['id'] ?? '').toString().trim(),
      title: (map['title'] ?? map['fileName'] ?? 'Materi').toString().trim(),
      description: (map['description'] ?? '').toString().trim(),
      fileUrl: (map['fileUrl'] ?? '').toString().trim(),
      fileName: (map['fileName'] ?? map['title'] ?? 'berkas').toString().trim(),
      fileType: (map['fileType'] ?? 'file').toString().trim().toLowerCase(),
      mimeType: (map['mimeType'] ?? '').toString().trim(),
      fileSize: (map['fileSize'] ?? '').toString().trim(),
      storageType: (map['storageType'] ?? 'cloudinary').toString().trim(),
      uploadedAt: (map['uploadedAt'] ?? '').toString().trim(),
    );
  }
}

/// Model satu pertemuan dalam array `classes/{classId}.meetings[]`.
class ClassMeeting {
  const ClassMeeting({
    required this.order,
    required this.title,
    required this.description,
    required this.materialFiles,
    required this.deltaPlainText,
    required this.videoUrl,
    required this.videos,
    required this.pdfUrl,
    required this.rawMap,
  });

  final int order;
  final String title;
  final String description;
  final List<MaterialFileItem> materialFiles;
  final String deltaPlainText;
  final String videoUrl;
  final List<String> videos;
  final String pdfUrl;
  final Map<String, dynamic> rawMap;

  /// Mengumpulkan seluruh tautan video aman pada pertemuan ini (`videoUrl` & `videos[]`).
  List<String> get playableVideoUrls {
    final seen = <String>{};
    final result = <String>[];

    void addCandidate(String? raw) {
      final resolved = UrlUtils.resolvePlayableVideoUrl(raw);
      if (resolved != null && seen.add(resolved)) {
        result.add(resolved);
      }
    }

    addCandidate(videoUrl);
    for (final v in videos) {
      addCandidate(v);
    }
    return result;
  }

  bool get hasDeltaContent => deltaPlainText.trim().isNotEmpty;

  factory ClassMeeting.fromMap(Map<String, dynamic> map, {int fallbackOrder = 1}) {
    final rawOrder = map['order'];
    final parsedOrder = rawOrder is num
        ? rawOrder.toInt()
        : int.tryParse(rawOrder?.toString() ?? '') ?? fallbackOrder;

    final rawFiles = map['materialFiles'];
    final parsedFiles = rawFiles is List
        ? rawFiles
            .whereType<Map>()
            .map((e) => MaterialFileItem.fromMap(Map<String, dynamic>.from(e)))
            .toList(growable: false)
        : const <MaterialFileItem>[];

    final rawVideos = map['videos'];
    final parsedVideos = rawVideos is List
        ? rawVideos.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList(growable: false)
        : const <String>[];

    return ClassMeeting(
      order: parsedOrder,
      title: (map['title'] ?? 'Pertemuan $parsedOrder').toString().trim(),
      description: (map['description'] ?? '').toString().trim(),
      materialFiles: parsedFiles,
      deltaPlainText: UrlUtils.deltaContentToPlainText(map['deltaContent']),
      videoUrl: (map['videoUrl'] ?? '').toString().trim(),
      videos: parsedVideos,
      pdfUrl: (map['pdfUrl'] ?? '').toString().trim(),
      rawMap: Map<String, dynamic>.from(map),
    );
  }
}

/// Model kelas Smartsa LMS dari koleksi `classes/{classId}`.
class LmsClass {
  const LmsClass({
    required this.id,
    required this.name,
    required this.title,
    required this.code,
    required this.description,
    required this.instructor,
    required this.lecturerId,
    required this.category,
    required this.day,
    required this.time,
    required this.enrolledCount,
    required this.maxStudents,
    required this.meetingsCount,
    required this.materialsCount,
    required this.isActive,
    this.meetings = const <ClassMeeting>[],
    this.coverImage,
  });

  final String id;
  final String name;
  final String title;
  final String code;
  final String description;
  final String instructor;
  final String lecturerId;
  final String category;
  final String day;
  final String time;
  final int enrolledCount;
  final int maxStudents;
  final int meetingsCount;
  final int materialsCount;
  final bool isActive;
  final List<ClassMeeting> meetings;
  final String? coverImage;

  String get displayTitle {
    if (title.trim().isNotEmpty) return title.trim();
    if (name.trim().isNotEmpty) return name.trim();
    return 'Kelas Tanpa Judul';
  }

  String get scheduleLabel {
    final parts = [day.trim(), time.trim()].where((p) => p.isNotEmpty).toList();
    return parts.isEmpty ? 'Jadwal fleksibel' : parts.join(' • ');
  }

  factory LmsClass.fromMap(String id, Map<String, dynamic> map) {
    final rawMeetings = map['meetings'];
    final parsedMeetings = <ClassMeeting>[];
    if (rawMeetings is List) {
      for (var i = 0; i < rawMeetings.length; i++) {
        final item = rawMeetings[i];
        if (item is Map) {
          parsedMeetings.add(
            ClassMeeting.fromMap(
              Map<String, dynamic>.from(item),
              fallbackOrder: i + 1,
            ),
          );
        }
      }
      parsedMeetings.sort((a, b) => a.order.compareTo(b.order));
    }

    final derivedMeetingsCount =
        rawMeetings is List ? parsedMeetings.length : _asInt(map['meetingsCount']);

    return LmsClass(
      id: id,
      name: (map['name'] ?? map['title'] ?? '').toString().trim(),
      title: (map['title'] ?? map['name'] ?? '').toString().trim(),
      code: (map['code'] ?? '').toString().trim().toUpperCase(),
      description: (map['description'] ?? '').toString().trim(),
      instructor: (map['instructor'] ?? map['lecturer'] ?? 'Dosen Pengampu')
          .toString()
          .trim(),
      lecturerId: (map['lecturerId'] ?? '').toString().trim(),
      category: (map['category'] ?? 'Umum').toString().trim(),
      day: (map['day'] ?? '').toString().trim(),
      time: (map['time'] ?? '').toString().trim(),
      enrolledCount: _asInt(map['enrolledCount']),
      maxStudents: _asInt(map['maxStudents']),
      meetingsCount: derivedMeetingsCount,
      materialsCount: _asInt(map['materialsCount']),
      isActive: map['isActive'] != false,
      meetings: parsedMeetings,
      coverImage: _nullableString(map['coverImage']),
    );
  }

  static int _asInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  static String? _nullableString(dynamic value) {
    if (value == null) return null;
    final str = value.toString().trim();
    return str.isEmpty ? null : str;
  }
}

/// Representasi dokumen keanggotaan pada `class_members/{classId}_{uid}`.
class ClassMembership {
  const ClassMembership({
    required this.id,
    required this.classId,
    required this.uid,
    required this.status,
    required this.accountType,
    this.displayName = '',
    this.email = '',
    this.role = 'student',
  });

  final String id;
  final String classId;
  final String uid;
  final String status;
  final String accountType;
  final String displayName;
  final String email;
  final String role;

  bool get isApproved =>
      status.isEmpty || status == 'approved' || status == 'active';
  bool get isPending => status == 'pending';

  String get effectiveLabel {
    if (displayName.trim().isNotEmpty && displayName.trim() != 'Mahasiswa') {
      return displayName.trim();
    }
    if (email.trim().isNotEmpty) return email.trim();
    return uid.isNotEmpty ? uid : id;
  }

  factory ClassMembership.fromMap(String id, Map<String, dynamic> map) {
    final nameCandidate = (map['studentName'] ??
            map['displayName'] ??
            map['name'] ??
            '')
        .toString()
        .trim();
    return ClassMembership(
      id: id,
      classId: (map['classId'] ?? '').toString().trim(),
      uid: (map['uid'] ?? '').toString().trim(),
      status: (map['status'] ?? 'approved').toString().trim().toLowerCase(),
      accountType: (map['accountType'] ?? 'UMUM').toString().trim().toUpperCase(),
      displayName: nameCandidate,
      email: (map['email'] ?? '').toString().trim(),
      role: (map['role'] ?? 'student').toString().trim().toLowerCase(),
    );
  }
}

/// Status kesehatan layanan backend dari `GET /api/health`.
class ServerHealthStatus {
  const ServerHealthStatus({
    required this.success,
    required this.firestore,
    required this.cloudinaryConfigured,
    required this.geminiConfigured,
    required this.geminiModel,
  });

  final bool success;
  final bool firestore;
  final bool cloudinaryConfigured;
  final bool geminiConfigured;
  final String geminiModel;

  factory ServerHealthStatus.fromJson(Map<String, dynamic> json) {
    return ServerHealthStatus(
      success: json['success'] == true,
      firestore: json['firestore'] == true,
      cloudinaryConfigured: json['cloudinaryConfigured'] == true,
      geminiConfigured: json['geminiConfigured'] == true,
      geminiModel: (json['geminiModel'] ?? '-').toString().trim(),
    );
  }
}
