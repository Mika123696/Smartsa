import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:smartsalms/core/config/app_config.dart';
import 'package:smartsalms/core/models/lms_class.dart';
import 'package:smartsalms/core/models/user_profile.dart';
import 'package:smartsalms/core/theme/app_theme.dart';
import 'package:smartsalms/core/widgets/brand_logo.dart';

void main() {
  test('AppConfig exposes default Vercel URL and builds API endpoint URIs', () {
    expect(AppConfig.defaultApiBaseUrl, 'https://smarta-lms.vercel.app');
    expect(AppConfig.apiBaseUrl, 'https://smarta-lms.vercel.app');
    expect(
      AppConfig.apiUri('/api/bootstrap').toString(),
      'https://smarta-lms.vercel.app/api/bootstrap',
    );
    expect(
      AppConfig.apiUri('api/health').toString(),
      'https://smarta-lms.vercel.app/api/health',
    );
  });

  test('ThemeController loads default dark mode and persists theme toggles', () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final controller = ThemeController();

    await controller.load();
    expect(controller.themeMode, ThemeMode.dark);
    expect(controller.isDark, isTrue);

    await controller.toggleTheme();
    expect(controller.themeMode, ThemeMode.light);
    expect(controller.isDark, isFalse);

    final reloaded = ThemeController();
    await reloaded.load();
    expect(reloaded.themeMode, ThemeMode.light);
  });

  test('UserProfile and LmsClass parse bootstrap & Firestore maps cleanly', () {
    final profile = UserProfile.fromJson(<String, dynamic>{
      'uid': 'u1',
      'email': 'dosen.if@smartsa.edu',
      'displayName': 'Dr. Budi',
      'role': 'lecturer',
      'accountType': 'DOSEN',
      'isInstitutional': true,
      'emailVerified': true,
      'nidn': '00112233',
      'mfaEnabled': true,
      'mfaRequired': true,
    });
    expect(profile.isLecturer, isTrue);
    expect(profile.academicIdValue, '00112233');
    expect(profile.mfaRequired, isTrue);

    final lmsClass = LmsClass.fromMap('cls_1', <String, dynamic>{
      'title': 'Rekayasa Perangkat Lunak',
      'code': 'smrpl101',
      'instructor': 'Dr. Budi',
      'day': 'Senin',
      'time': '08:00',
      'enrolledCount': 25,
      'maxStudents': 40,
      'meetings': <Object>[<String, dynamic>{'order': 1}],
    });
    expect(lmsClass.code, 'SMRPL101');
    expect(lmsClass.meetingsCount, 1);
    expect(lmsClass.scheduleLabel, 'Senin • 08:00');
  });

  testWidgets('BrandLogo renders custom painter emblem cleanly', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: const Scaffold(
          body: Center(child: BrandLogo(size: 40)),
        ),
      ),
    );

    expect(find.byType(BrandLogo), findsOneWidget);
    expect(find.byType(CustomPaint), findsWidgets);
  });
}
