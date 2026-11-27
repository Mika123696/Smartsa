import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'core/config/app_config.dart';
import 'core/services/api_client.dart';
import 'core/services/firestore_service.dart';
import 'core/theme/app_theme.dart';
import 'core/widgets/brand_logo.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/auth_screen.dart';
import 'features/auth/mfa_challenge_screen.dart';
import 'features/shell/main_shell_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();

  final themeController = ThemeController();
  await themeController.load();

  final apiClient = ApiClient();
  final firestoreService = FirestoreService();
  final authController = AuthController(
    apiClient: apiClient,
    firestoreService: firestoreService,
  );

  runApp(
    SmartsaApp(
      themeController: themeController,
      authController: authController,
      apiClient: apiClient,
      firestoreService: firestoreService,
    ),
  );
}

/// Root widget Smartsa LMS Mobile yang mengelola tema persisten serta gerbang
/// Auth -> Strict MFA TOTP Gate -> MainShellScreen.
class SmartsaApp extends StatelessWidget {
  const SmartsaApp({
    super.key,
    required this.themeController,
    required this.authController,
    required this.apiClient,
    required this.firestoreService,
  });

  final ThemeController themeController;
  final AuthController authController;
  final ApiClient apiClient;
  final FirestoreService firestoreService;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge(<Listenable>[
        themeController,
        authController,
      ]),
      builder: (context, _) {
        return MaterialApp(
          title: AppConfig.appName,
          debugShowCheckedModeBanner: false,
          theme: AppTheme.lightTheme,
          darkTheme: AppTheme.darkTheme,
          themeMode: themeController.themeMode,
          home: _buildHomeGate(),
        );
      },
    );
  }

  Widget _buildHomeGate() {
    if (authController.isInitializing) {
      return const _SplashScreen();
    }
    if (!authController.isSignedIn) {
      return AuthScreen(authController: authController);
    }
    if (authController.mfaRequired) {
      return MfaChallengeScreen(authController: authController);
    }
    return MainShellScreen(
      authController: authController,
      themeController: themeController,
      apiClient: apiClient,
      firestoreService: firestoreService,
    );
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            BrandLogo(size: 48),
            SizedBox(height: 16),
            Text(
              AppConfig.appName,
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            SizedBox(height: 16),
            SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            ),
          ],
        ),
      ),
    );
  }
}
