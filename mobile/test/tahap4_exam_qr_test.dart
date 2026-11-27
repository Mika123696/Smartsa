import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:smartsalms/core/models/attendance_models.dart';
import 'package:smartsalms/core/models/exam_models.dart';
import 'package:smartsalms/core/models/lms_class.dart';
import 'package:smartsalms/core/utils/aiken_parser.dart';
import 'package:smartsalms/core/utils/attendance_qr_utils.dart';
import 'package:smartsalms/core/utils/exam_draft_store.dart';

void main() {
  group('AttendanceQrUtils payload parser', () {
    test('extracts session code from SMARTSA_QR prefix, raw code, JSON, and URL', () {
      expect(
        AttendanceQrUtils.buildPayload('rpl101-m01-4821'),
        'SMARTSA_QR:RPL101-M01-4821',
      );
      expect(
        AttendanceQrUtils.parsePayload('  SMARTSA_QR:RPL101-M01-4821  '),
        'RPL101-M01-4821',
      );
      expect(
        AttendanceQrUtils.parsePayload('smartsa_qr : cls-m02-9999'),
        'CLS-M02-9999',
      );
      expect(
        AttendanceQrUtils.parsePayload('  cls101-m03-1122 '),
        'CLS101-M03-1122',
      );
      expect(
        AttendanceQrUtils.parsePayload('{"sessionCode":"abc-m01-7777"}'),
        'ABC-M01-7777',
      );
      expect(
        AttendanceQrUtils.parsePayload(
          'https://smarta-lms.vercel.app/?sessionCode=pbo-m04-5566',
        ),
        'PBO-M04-5566',
      );
    });

    test('rejects blank, whitespace-containing, and invalid QR payloads', () {
      expect(AttendanceQrUtils.parsePayload(null), '');
      expect(AttendanceQrUtils.parsePayload('   '), '');
      expect(AttendanceQrUtils.parsePayload('SMARTSA_QR:   '), '');
      expect(AttendanceQrUtils.parsePayload('ABC DEF'), '');
      expect(AttendanceQrUtils.parsePayload('javascript:alert(1)'), '');
      expect(AttendanceQrUtils.parsePayload('A'), '');

      expect(AttendanceQrUtils.isValidSessionCode('RPL101-M01-4821'), isTrue);
      expect(AttendanceQrUtils.isValidSessionCode('AB'), isFalse);
      expect(AttendanceQrUtils.isValidSessionCode('BAD CODE!'), isFalse);
    });

    test('AttendanceSession parses expiresAt and tracks open state accurately', () {
      final now = DateTime.now().millisecondsSinceEpoch;
      final active = AttendanceSession.fromMap(<String, dynamic>{
        'meetingNo': 2,
        'sessionCode': 'RPL-M02-1234',
        'openedAt': now - 60000,
        'expiresAt': now + 600000,
        'isOpen': true,
      });
      expect(active, isNotNull);
      expect(active!.isCurrentlyOpen, isTrue);
      expect(active.isExpired, isFalse);

      final expired = AttendanceSession.fromMap(<String, dynamic>{
        'meetingNo': 2,
        'sessionCode': 'RPL-M02-1234',
        'openedAt': now - 900000,
        'expiresAt': now - 1000,
        'isOpen': true,
      });
      expect(expired!.isExpired, isTrue);
      expect(expired.isCurrentlyOpen, isFalse);
    });
  });

  group('AikenParser validation and line errors', () {
    test('parses valid 5-option (A-E) questions with A., A), CRLF, and case-insensitive ANSWER', () {
      const sample =
          'Enkapsulasi OOP bertujuan untuk?\r\n'
          'A. Menghapus konstruktor\r\n'
          'B. Menyembunyikan detail implementasi\r\n'
          'C. Mematikan thread\r\n'
          'D. Menggandakan objek\r\n'
          'E. Menghapus method\r\n'
          'answer: b\r\n'
          '\r\n'
          'Protokol HTTP stateless artinya?\n'
          'A) Setiap request membawa konteks autentikasi sendiri\n'
          'B) Server selalu menyimpan DOM klien\n'
          'C) Hanya berjalan di WebSocket\n'
          'D) Wajib memakai cookie sesi\n'
          'E) Tidak mendukung JSON\n'
          'ANSWER: A';

      final result = AikenParser.parse(sample);

      expect(result.errors, isEmpty);
      expect(result.questions, hasLength(2));
      expect(result.questions[0].id, 'q1');
      expect(result.questions[0].options, hasLength(5));
      expect(result.questions[0].answerIdx, 1);
      expect(result.questions[0].answerLetter, 'B');
      expect(result.questions[1].id, 'q2');
      expect(result.questions[1].answerIdx, 0);
      expect(result.answerKey, <String, int>{'q1': 1, 'q2': 0});
    });

    test('reports line numbers accurately on invalid ANSWER, fewer than 2 options, and option order errors', () {
      const invalidSamples = '''
Soal 1 tanpa cukup opsi
A. Satu opsi saja
ANSWER: A

Soal 2 jawaban di luar opsi
A. Benar
B. Salah
ANSWER: E

Soal 3 urutan opsi loncat
A. Pertama
C. Ketiga
ANSWER: A
''';

      final result = AikenParser.parse(invalidSamples);

      expect(result.questions, isEmpty);
      expect(result.errors, hasLength(3));
      expect(result.errors[0].line, 1);
      expect(result.errors[0].message, contains('2 hingga 6 opsi'));
      expect(result.errors[1].line, 8);
      expect(result.errors[1].message, contains('ANSWER "E"'));
      expect(result.errors[2].line, 12);
      expect(result.errors[2].message, contains('Baris 12'));
    });

    test('reports line error on empty input and standalone ANSWER line', () {
      final emptyResult = AikenParser.parse('   ');
      expect(emptyResult.questions, isEmpty);
      expect(emptyResult.errors.single.line, 1);

      final strayAnswer = AikenParser.parse('ANSWER: A');
      expect(strayAnswer.questions, isEmpty);
      expect(strayAnswer.errors.single.line, 1);
      expect(strayAnswer.errors.single.message, contains('tanpa pertanyaan'));
    });
  });

  group('Exam pointsPerQuestion, local draft persistence, and Gain rekap', () {
    test('calculates equal pointsPerQuestion accurately matching server /api/grade', () {
      expect(ExamDraftStore.computePointsPerQuestion(0), 0);
      expect(ExamDraftStore.computePointsPerQuestion(4), 25.0);
      expect(ExamDraftStore.computePointsPerQuestion(5), 20.0);
      expect(ExamDraftStore.computePointsPerQuestion(3), 33.33);
    });

    test('saves, restores, and clears per-user exam draft answers in SharedPreferences', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});

      final key = ExamDraftStore.buildStorageKey(
        classId: 'cls_rpl',
        meetingNo: 3,
        examType: 'posttest',
        uid: 'mhs_42',
      );
      expect(key, 'smartsa_exam_draft_cls_rpl_m3_posttest_mhs_42');

      await ExamDraftStore.writeDraftAnswers(
        classId: 'cls_rpl',
        meetingNo: 3,
        examType: 'posttest',
        uid: 'mhs_42',
        answers: const <String, int>{'q1': 1, 'q2': 4},
      );

      final restored = await ExamDraftStore.readDraftAnswers(
        classId: 'cls_rpl',
        meetingNo: 3,
        examType: 'posttest',
        uid: 'mhs_42',
      );
      expect(restored, <String, int>{'q1': 1, 'q2': 4});

      // Berbeda tipe ujian -> tetap terisolasi kosong
      final isolatedPretest = await ExamDraftStore.readDraftAnswers(
        classId: 'cls_rpl',
        meetingNo: 3,
        examType: 'pretest',
        uid: 'mhs_42',
      );
      expect(isolatedPretest, isEmpty);

      await ExamDraftStore.clearDraftAnswers(
        classId: 'cls_rpl',
        meetingNo: 3,
        examType: 'posttest',
        uid: 'mhs_42',
      );

      final afterClear = await ExamDraftStore.readDraftAnswers(
        classId: 'cls_rpl',
        meetingNo: 3,
        examType: 'posttest',
        uid: 'mhs_42',
      );
      expect(afterClear, isEmpty);
    });

    test('resolves student display name from class_members and computes Posttest - Pretest Gain', () {
      final members = <ClassMembership>[
        const ClassMembership(
          id: 'cls1_u1',
          classId: 'cls1',
          uid: 'u1',
          status: 'approved',
          accountType: 'MAHASISWA',
          displayName: 'Siti Rahma',
          email: 'siti@smartsa.edu',
        ),
      ];
      final attempts = <ExamAttempt>[
        ExamAttempt.fromMap('cls1_m1_pretest_u1', <String, dynamic>{
          'classId': 'cls1',
          'meetingNo': 1,
          'uid': 'u1',
          'studentName': 'Mahasiswa',
          'examType': 'pretest',
          'status': 'submitted',
          'score': 60,
        }),
        ExamAttempt.fromMap('cls1_m1_posttest_u1', <String, dynamic>{
          'classId': 'cls1',
          'meetingNo': 1,
          'uid': 'u1',
          'studentName': 'Mahasiswa',
          'examType': 'posttest',
          'status': 'submitted',
          'score': 90,
        }),
      ];

      final rows = ExamStudentGainRow.buildGainRows(
        attempts: attempts,
        members: members,
        meetingNo: 1,
      );

      expect(rows, hasLength(1));
      expect(rows.first.displayName, 'Siti Rahma');
      expect(rows.first.pretestScore, 60);
      expect(rows.first.posttestScore, 90);
      expect(rows.first.gainDelta, 30);
    });
  });
}
