import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:smartsalms/core/models/assignment_models.dart';
import 'package:smartsalms/core/models/lms_class.dart';
import 'package:smartsalms/core/services/api_client.dart';
import 'package:smartsalms/core/services/cloudinary_upload_service.dart';
import 'package:smartsalms/core/utils/ai_markdown.dart';
import 'package:smartsalms/core/utils/url_utils.dart';

void main() {
  group('AI Markdown & Safe URL sanitization', () {
    test('converts inline LaTeX operators outside code blocks and preserves code blocks', () {
      const raw = r'''
Alur autentikasi: Token $\rightarrow$ Server $\ge$ 200 dan $a \times b \le c$.
Inline code tetap utuh: `$\rightarrow$` dan `\times`.
```dart
final arrow = r'$\rightarrow$ \ge \le \times';
```
''';

      final normalized = AiMarkdownHelper.normalizeAiMarkdownText(raw);

      expect(normalized, contains('Token → Server ≥ 200 dan a × b ≤ c.'));
      expect(normalized, contains(r'`$\rightarrow$` dan `\times`'));
      expect(
        normalized,
        contains(r"final arrow = r'$\rightarrow$ \ge \le \times';"),
      );
    });

    test('validates safe https:// URLs and rejects javascript:/data:/blob: schemes', () {
      expect(UrlUtils.isSafeHttpUrl('https://res.cloudinary.com/demo/file.pdf'), isTrue);
      expect(
        UrlUtils.isSafeHttpUrl('https://example.com/file.pdf', requireHttps: true),
        isTrue,
      );
      expect(
        UrlUtils.isSafeHttpUrl('http://example.com/file.pdf', requireHttps: true),
        isFalse,
      );
      expect(UrlUtils.isSafeHttpUrl('http://example.com/video.mp4'), isTrue);

      expect(UrlUtils.isSafeHttpUrl('javascript:alert(1)'), isFalse);
      expect(UrlUtils.isSafeHttpUrl('JAVASCRIPT:alert(1)'), isFalse);
      expect(UrlUtils.isSafeHttpUrl('data:text/html,<script>alert(1)</script>'), isFalse);
      expect(UrlUtils.isSafeHttpUrl('blob:https://smartsa.app/123'), isFalse);
      expect(UrlUtils.isSafeHttpUrl('https://bad url.com/a.pdf'), isFalse);
      expect(UrlUtils.sanitizeSafeUrl('javascript:void(0)'), isNull);
    });
  });

  group('YouTube URL normalization & Delta text fallback', () {
    test('normalizes watch, youtu.be, shorts, and live URLs to canonical watch URL', () {
      expect(
        UrlUtils.normalizeYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s'),
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
      expect(
        UrlUtils.normalizeYouTubeUrl('https://youtu.be/abcDEF_123?si=xyz'),
        'https://www.youtube.com/watch?v=abcDEF_123',
      );
      expect(
        UrlUtils.normalizeYouTubeUrl('https://www.youtube.com/shorts/shortVid123'),
        'https://www.youtube.com/watch?v=shortVid123',
      );
      expect(
        UrlUtils.normalizeYouTubeUrl('https://youtube.com/live/liveStream987?feature=share'),
        'https://www.youtube.com/watch?v=liveStream987',
      );
      expect(
        UrlUtils.normalizeYouTubeUrl('javascript:alert(1)'),
        isNull,
      );
    });

    test('converts legacy Delta JSON ops into clean readable text and parses meeting files', () {
      final meeting = ClassMeeting.fromMap(<String, dynamic>{
        'order': 1,
        'title': 'Pengenalan Firestore',
        'videoUrl': 'https://youtu.be/abcDEF_123',
        'deltaContent': <String, dynamic>{
          'ops': <Map<String, dynamic>>[
            <String, dynamic>{'insert': 'Materi Pertemuan 1\n'},
            <String, dynamic>{'insert': 'Pelajari aturan keamanan.'},
          ],
        },
        'materialFiles': <Map<String, dynamic>>[
          <String, dynamic>{
            'id': 'mat_1',
            'title': 'Slide Minggu 1',
            'fileUrl': 'https://res.cloudinary.com/demo/slide1.pdf',
            'fileName': 'slide1.pdf',
            'fileType': 'pdf',
            'fileSize': '1.20 MB',
          },
        ],
      });

      expect(meeting.hasDeltaContent, isTrue);
      expect(meeting.deltaPlainText, 'Materi Pertemuan 1\nPelajari aturan keamanan.');
      expect(meeting.materialFiles, hasLength(1));
      expect(meeting.playableVideoUrls, <String>[
        'https://www.youtube.com/watch?v=abcDEF_123',
      ]);
    });
  });

  group('Cloudinary submission validation & graded submission lock', () {
    test('enforces whitelist extensions, MIME types, and 15 MB max size for submission', () {
      // Valid submission files
      expect(
        () => CloudinaryUploadService.validateFile(
          category: 'submission',
          fileName: 'laporan_akhir.pdf',
          fileSize: 5 * 1024 * 1024,
          mimeType: 'application/pdf',
        ),
        returnsNormally,
      );
      expect(
        () => CloudinaryUploadService.validateFile(
          category: 'submission',
          fileName: 'kode_proyek.zip',
          fileSize: 15 * 1024 * 1024,
        ),
        returnsNormally,
      );

      // Oversized (> 15 MB)
      expect(
        () => CloudinaryUploadService.validateFile(
          category: 'submission',
          fileName: 'laporan_besar.pdf',
          fileSize: (15 * 1024 * 1024) + 1,
        ),
        throwsA(isA<CloudinaryUploadException>()),
      );

      // Disallowed extension (.exe / .txt)
      expect(
        () => CloudinaryUploadService.validateFile(
          category: 'submission',
          fileName: 'malware.exe',
          fileSize: 1024,
        ),
        throwsA(isA<CloudinaryUploadException>()),
      );
      expect(
        () => CloudinaryUploadService.validateFile(
          category: 'submission',
          fileName: 'catatan.txt',
          fileSize: 1024,
        ),
        throwsA(isA<CloudinaryUploadException>()),
      );

      // Empty 0-byte file
      expect(
        () => CloudinaryUploadService.validateFile(
          category: 'submission',
          fileName: 'kosong.pdf',
          fileSize: 0,
        ),
        throwsA(isA<CloudinaryUploadException>()),
      );
    });

    test('uploadFile requests /api/upload-sign and posts signed multipart to Cloudinary', () async {
      final recordedUris = <Uri>[];
      final mockHttp = MockClient((request) async {
        recordedUris.add(request.url);
        if (request.url.path == '/api/upload-sign') {
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          expect(body['category'], 'submission');
          expect(body['classId'], 'cls_1');
          expect(body['assignmentId'], 'asg_1');
          return http.Response(
            jsonEncode(<String, dynamic>{
              'signature': 'sig_abc',
              'timestamp': 1700000000,
              'api_key': 'cloud_key_123',
              'cloud_name': 'smartsa-cloud',
              'folder': 'smartsa/submissions/cls_1/asg_1/uid_1',
            }),
            200,
          );
        }
        return http.Response(
          jsonEncode(<String, dynamic>{
            'secure_url':
                'https://res.cloudinary.com/smartsa-cloud/raw/upload/v1/tugas.pdf',
          }),
          200,
        );
      });

      final apiClient = ApiClient(
        httpClient: mockHttp,
        tokenProvider: () async => 'firebase-token',
      );
      final uploader = CloudinaryUploadService(
        apiClient: apiClient,
        httpClient: mockHttp,
      );

      final result = await uploader.uploadFile(
        category: 'submission',
        fileName: 'tugas.pdf',
        fileSize: 4,
        bytes: Uint8List.fromList(<int>[1, 2, 3, 4]),
        mimeType: 'application/pdf',
        classId: 'cls_1',
        assignmentId: 'asg_1',
      );

      expect(recordedUris, hasLength(2));
      expect(recordedUris[0].path, '/api/upload-sign');
      expect(
        recordedUris[1].toString(),
        'https://api.cloudinary.com/v1_1/smartsa-cloud/auto/upload',
      );
      expect(
        result.url,
        'https://res.cloudinary.com/smartsa-cloud/raw/upload/v1/tugas.pdf',
      );
      expect(result.fileType, 'pdf');
    });

    test('detects read-only locked state when submission already has grade or score', () {
      final ungraded = SubmissionItem.fromMap('asg1_u1', <String, dynamic>{
        'assignmentId': 'asg1',
        'classId': 'cls1',
        'uid': 'u1',
        'fileUrl': 'https://res.cloudinary.com/demo/a.pdf',
      });
      expect(ungraded.isLocked, isFalse);
      expect(ungraded.effectiveGrade, isNull);

      final gradedByGradeField = SubmissionItem.fromMap(
        'asg1_u1',
        <String, dynamic>{
          'assignmentId': 'asg1',
          'classId': 'cls1',
          'uid': 'u1',
          'grade': 92,
          'feedback': 'Bagus',
        },
      );
      expect(gradedByGradeField.isLocked, isTrue);
      expect(gradedByGradeField.effectiveGrade, 92);

      final gradedByScoreField = SubmissionItem.fromMap(
        'asg1_u1',
        <String, dynamic>{
          'assignmentId': 'asg1',
          'classId': 'cls1',
          'uid': 'u1',
          'score': 88,
        },
      );
      expect(gradedByScoreField.isLocked, isTrue);
      expect(gradedByScoreField.effectiveGrade, 88);
    });
  });
}
