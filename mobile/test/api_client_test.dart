import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:smartsalms/core/services/api_client.dart';

void main() {
  group('ApiClient stateless requests & error parsing', () {
    test('attaches Bearer token without Origin header and uses AppConfig base URL', () async {
      late http.Request capturedReq;
      final mockHttp = MockClient((request) async {
        capturedReq = request;
        return http.Response(
          jsonEncode(<String, dynamic>{
            'success': true,
            'isNewUser': false,
            'mfaEnabled': false,
            'mfaRequired': false,
          }),
          200,
          headers: const <String, String>{'content-type': 'application/json'},
        );
      });

      final client = ApiClient(
        httpClient: mockHttp,
        tokenProvider: () async => 'firebase-id-token-123',
      );

      final res = await client.postBootstrap(<String, dynamic>{
        'provider': 'google.com',
      });

      expect(res['success'], isTrue);
      expect(
        capturedReq.url.toString(),
        'https://smarta-lms.vercel.app/api/bootstrap',
      );
      expect(capturedReq.method, 'POST');
      expect(
        capturedReq.headers['Authorization'],
        'Bearer firebase-id-token-123',
      );
      expect(capturedReq.headers['Content-Type'], 'application/json');
      expect(capturedReq.headers.containsKey('Origin'), isFalse);
      expect(capturedReq.headers.containsKey('origin'), isFalse);
      expect(jsonDecode(capturedReq.body), <String, dynamic>{
        'provider': 'google.com',
      });
    });

    test('getHealth sends GET with Bearer token and parses ServerHealth payload', () async {
      late http.Request capturedReq;
      final mockHttp = MockClient((request) async {
        capturedReq = request;
        return http.Response(
          jsonEncode(<String, dynamic>{
            'success': true,
            'firestore': true,
            'cloudinaryConfigured': true,
            'geminiConfigured': false,
            'geminiModel': 'gemini-4-hydrogen',
          }),
          200,
        );
      });

      final client = ApiClient(
        httpClient: mockHttp,
        tokenProvider: () async => 'admin-token',
        baseUrl: 'https://custom.smartsa.app/',
      );

      final health = await client.getHealth();
      expect(capturedReq.method, 'GET');
      expect(capturedReq.url.toString(), 'https://custom.smartsa.app/api/health');
      expect(capturedReq.headers['Authorization'], 'Bearer admin-token');
      expect(health['firestore'], isTrue);
      expect(health['geminiModel'], 'gemini-4-hydrogen');
    });

    test('postJoinClass normalizes classCode and postMfa forwards action payload', () async {
      final calls = <http.Request>[];
      final mockHttp = MockClient((request) async {
        calls.add(request);
        return http.Response(jsonEncode(<String, dynamic>{'success': true}), 200);
      });

      final client = ApiClient(
        httpClient: mockHttp,
        tokenProvider: () async => 'tok',
      );

      await client.postJoinClass('  pbo101 ');
      await client.postMfa('verify', <String, dynamic>{'code': '123456'});

      expect(calls, hasLength(2));
      expect(calls[0].url.path, '/api/join-class');
      expect(jsonDecode(calls[0].body), <String, dynamic>{'classCode': 'PBO101'});
      expect(calls[1].url.path, '/api/mfa');
      expect(jsonDecode(calls[1].body), <String, dynamic>{
        'action': 'verify',
        'code': '123456',
      });
    });

    test('throws 401 ApiException when Firebase ID token is missing', () async {
      final mockHttp = MockClient((_) async {
        fail('HTTP client should not be called without a token');
      });

      final client = ApiClient(
        httpClient: mockHttp,
        tokenProvider: () async => null,
      );

      await expectLater(
        client.getHealth(),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 401)
              .having((e) => e.code, 'code', 'UNAUTHORIZED'),
        ),
      );
    });

    test('parses 400, 401, 403, 429 (Retry-After), 502, and 503 errors accurately', () async {
      final cases = <({
        int status,
        String body,
        Map<String, String> headers,
        String expectedCode,
        String expectedMsgPart,
        int? expectedRetry,
      })>[
        (
          status: 400,
          body: jsonEncode(<String, dynamic>{
            'error': 'Kode kelas tidak valid.',
            'code': 'INVALID_CLASS_CODE',
          }),
          headers: const <String, String>{},
          expectedCode: 'INVALID_CLASS_CODE',
          expectedMsgPart: 'Kode kelas tidak valid.',
          expectedRetry: null,
        ),
        (
          status: 401,
          body: '',
          headers: const <String, String>{},
          expectedCode: 'UNAUTHORIZED',
          expectedMsgPart: 'Sesi autentikasi tidak valid',
          expectedRetry: null,
        ),
        (
          status: 403,
          body: jsonEncode(<String, dynamic>{
            'error': 'Asisten AI dinonaktifkan saat ujian.',
            'code': 'EXAM_LOCKOUT',
          }),
          headers: const <String, String>{},
          expectedCode: 'EXAM_LOCKOUT',
          expectedMsgPart: 'dinonaktifkan',
          expectedRetry: null,
        ),
        (
          status: 429,
          body: jsonEncode(<String, dynamic>{
            'error': 'Terlalu banyak permintaan.',
            'code': 'RATE_LIMIT_EXCEEDED',
          }),
          headers: const <String, String>{'retry-after': '420'},
          expectedCode: 'RATE_LIMIT_EXCEEDED',
          expectedMsgPart: 'Terlalu banyak permintaan.',
          expectedRetry: 420,
        ),
        (
          status: 502,
          body: '<html>Bad Gateway</html>',
          headers: const <String, String>{},
          expectedCode: 'BAD_GATEWAY',
          expectedMsgPart: '502',
          expectedRetry: null,
        ),
        (
          status: 503,
          body: jsonEncode(<String, dynamic>{
            'error': 'Cloudinary belum dikonfigurasi.',
            'code': 'CLOUDINARY_NOT_CONFIGURED',
          }),
          headers: const <String, String>{},
          expectedCode: 'CLOUDINARY_NOT_CONFIGURED',
          expectedMsgPart: 'Cloudinary belum dikonfigurasi.',
          expectedRetry: null,
        ),
      ];

      for (final c in cases) {
        final mockHttp = MockClient(
          (_) async => http.Response(c.body, c.status, headers: c.headers),
        );
        final client = ApiClient(
          httpClient: mockHttp,
          tokenProvider: () async => 'tok',
        );

        await expectLater(
          client.postBootstrap(),
          throwsA(
            isA<ApiException>()
                .having((e) => e.statusCode, 'statusCode', c.status)
                .having((e) => e.code, 'code', c.expectedCode)
                .having((e) => e.message, 'message', contains(c.expectedMsgPart))
                .having(
                  (e) => e.retryAfterSeconds,
                  'retryAfterSeconds',
                  c.expectedRetry,
                ),
          ),
        );
      }
    });
  });
}
