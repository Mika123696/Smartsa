import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../core/models/user_profile.dart';
import '../../core/services/api_client.dart';
import '../../core/services/firestore_service.dart';

/// Mengorkestrasi sesi Firebase Auth, Google Sign-In, bootstrap `/api/bootstrap`,
/// dan gerbang verifikasi MFA TOTP (`/api/mfa`).
class AuthController extends ChangeNotifier {
  AuthController({
    required this._apiClient,
    required this._firestoreService,
    FirebaseAuth? firebaseAuth,
  }) : _authOverride = firebaseAuth {
    _authSub = _firebaseAuth.authStateChanges().listen(_handleAuthStateChanged);
  }

  final ApiClient _apiClient;
  final FirestoreService _firestoreService;
  final FirebaseAuth? _authOverride;

  FirebaseAuth get _firebaseAuth => _authOverride ?? FirebaseAuth.instance;

  StreamSubscription<User?>? _authSub;
  Future<void>? _googleInitFuture;

  User? _currentUser;
  UserProfile? _profile;
  bool _isInitializing = true;
  bool _isBusy = false;
  bool _isExplicitAuthInFlight = false;
  int _syncSeq = 0;
  String? _errorMessage;

  User? get currentUser => _currentUser;
  UserProfile? get profile => _profile;
  bool get isInitializing => _isInitializing;
  bool get isBusy => _isBusy;
  bool get isSignedIn => _currentUser != null;
  bool get mfaRequired => _profile?.mfaRequired ?? false;
  String? get errorMessage => _errorMessage;

  Future<void> _ensureGoogleInitialized() {
    return _googleInitFuture ??= GoogleSignIn.instance.initialize();
  }

  Future<void> _handleAuthStateChanged(User? user) async {
    if (_isExplicitAuthInFlight) {
      return;
    }

    final seq = ++_syncSeq;
    _currentUser = user;

    if (user == null) {
      _profile = null;
      _isInitializing = false;
      notifyListeners();
      return;
    }

    final synced = await _syncViaBootstrap(user);
    if (seq != _syncSeq) return;

    _profile = synced;
    _isInitializing = false;
    notifyListeners();
  }

  Future<UserProfile> _syncViaBootstrap(
    User user, {
    Map<String, dynamic>? bootstrapPayload,
  }) async {
    try {
      final data = await _apiClient.postBootstrap(bootstrapPayload);
      final rawProfile = data['profile'];
      if (rawProfile is Map<String, dynamic>) {
        return UserProfile.fromJson(
          rawProfile,
          mfaEnabledOverride: data['mfaEnabled'] is bool
              ? data['mfaEnabled'] as bool
              : null,
          mfaRequiredOverride: data['mfaRequired'] is bool
              ? data['mfaRequired'] as bool
              : null,
        );
      }
    } catch (_) {
      // Fallback read-only ke Firestore jika backend sedang unreachable.
    }

    final fallback = await _firestoreService.fetchUserProfileFallback(
      uid: user.uid,
      email: user.email ?? '',
      emailVerified: user.emailVerified,
      fallbackDisplayName: user.displayName,
      fallbackPhotoUrl: user.photoURL,
    );
    if (fallback != null) {
      return fallback;
    }

    return UserProfile(
      uid: user.uid,
      email: user.email ?? '',
      name: user.displayName ?? '',
      displayName: user.displayName ?? '',
      photoUrl: user.photoURL,
      role: 'student',
      accountType: 'UMUM',
      isInstitutional: false,
      emailVerified: user.emailVerified,
      institution: 'Universitas Negeri Surabaya',
      nim: '',
      nidn: '',
      nip: '',
      mfaEnabled: false,
      mfaRequired: false,
    );
  }

  /// Masuk dengan Email & Kata Sandi lalu sinkronkan profil lewat `/api/bootstrap`.
  Future<void> signInWithEmail({
    required String email,
    required String password,
  }) async {
    final cleanEmail = email.trim().toLowerCase();
    if (cleanEmail.isEmpty || password.isEmpty) {
      throw const FormatException('Email dan kata sandi wajib diisi.');
    }

    _setBusy(true);
    _isExplicitAuthInFlight = true;
    final seq = ++_syncSeq;

    try {
      final credential = await _firebaseAuth.signInWithEmailAndPassword(
        email: cleanEmail,
        password: password,
      );
      final user = credential.user;
      if (user == null) {
        throw StateError('Sesi Firebase tidak ditemukan setelah login.');
      }
      _currentUser = user;
      _profile = await _syncViaBootstrap(user);
      if (seq == _syncSeq) {
        _isInitializing = false;
      }
    } on FirebaseAuthException catch (e) {
      throw Exception(_mapFirebaseAuthError(e));
    } finally {
      _isExplicitAuthInFlight = false;
      _setBusy(false);
    }
  }

  /// Mendaftarkan akun baru, kirim verifikasi email, dan sinkronkan `/api/bootstrap`.
  Future<void> registerWithEmail({
    required String email,
    required String password,
    required String displayName,
    String institution = '',
    String nim = '',
  }) async {
    final cleanEmail = email.trim().toLowerCase();
    final cleanName =
        displayName.trim().isNotEmpty
            ? displayName.trim()
            : (cleanEmail.contains('@')
                ? cleanEmail.split('@').first
                : 'Mahasiswa');

    if (cleanEmail.isEmpty || password.isEmpty) {
      throw const FormatException('Email dan kata sandi wajib diisi.');
    }

    _setBusy(true);
    _isExplicitAuthInFlight = true;
    final seq = ++_syncSeq;

    try {
      final credential = await _firebaseAuth.createUserWithEmailAndPassword(
        email: cleanEmail,
        password: password,
      );
      final user = credential.user;
      if (user == null) {
        throw StateError('Gagal membuat akun pengguna.');
      }

      try {
        await user.updateDisplayName(cleanName);
      } catch (_) {}

      try {
        await user.sendEmailVerification();
      } catch (_) {}

      _currentUser = user;
      _profile = await _syncViaBootstrap(
        user,
        bootstrapPayload: <String, dynamic>{
          'displayName': cleanName,
          if (institution.trim().isNotEmpty) 'institution': institution.trim(),
          if (nim.trim().isNotEmpty) 'nim': nim.trim(),
        },
      );
      if (seq == _syncSeq) {
        _isInitializing = false;
      }
    } on FirebaseAuthException catch (e) {
      throw Exception(_mapFirebaseAuthError(e));
    } finally {
      _isExplicitAuthInFlight = false;
      _setBusy(false);
    }
  }

  /// Mengirim tautan pemulihan kata sandi melalui Firebase Auth.
  Future<void> sendPasswordReset(String email) async {
    final cleanEmail = email.trim();
    if (cleanEmail.isEmpty) {
      throw const FormatException('Masukkan alamat email Anda terlebih dahulu.');
    }
    _setBusy(true);
    try {
      await _firebaseAuth.sendPasswordResetEmail(email: cleanEmail);
    } on FirebaseAuthException catch (e) {
      throw Exception(_mapFirebaseAuthError(e));
    } finally {
      _setBusy(false);
    }
  }

  /// Masuk dengan Akun Google via `google_sign_in` -> FirebaseAuth -> `/api/bootstrap`.
  Future<void> signInWithGoogle() async {
    _setBusy(true);
    _isExplicitAuthInFlight = true;
    final seq = ++_syncSeq;

    try {
      await _ensureGoogleInitialized();
      final account = await GoogleSignIn.instance.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw Exception(
          'Token ID Google tidak ditemukan. Pastikan google-services.json memuat Web Client ID (client_type: 3).',
        );
      }

      final credential = GoogleAuthProvider.credential(idToken: idToken);
      final userCredential =
          await _firebaseAuth.signInWithCredential(credential);
      final user = userCredential.user;
      if (user == null) {
        throw StateError('Autentikasi Firebase dengan Google tidak mengembalikan sesi.');
      }

      _currentUser = user;
      _profile = await _syncViaBootstrap(
        user,
        bootstrapPayload: const <String, dynamic>{'provider': 'google.com'},
      );
      if (seq == _syncSeq) {
        _isInitializing = false;
      }
    } on GoogleSignInException catch (e) {
      throw Exception(_mapGoogleSignInError(e));
    } on FirebaseAuthException catch (e) {
      throw Exception(_mapFirebaseAuthError(e));
    } finally {
      _isExplicitAuthInFlight = false;
      _setBusy(false);
    }
  }

  /// Memverifikasi tantangan MFA TOTP atau Backup Code melalui `POST /api/mfa`.
  Future<void> verifyMfaChallenge({String? code, String? backupCode}) async {
    final cleanCode = code?.trim() ?? '';
    final cleanBackup = backupCode?.trim() ?? '';
    if (cleanCode.isEmpty && cleanBackup.isEmpty) {
      throw const FormatException('Masukkan kode Authenticator atau Backup Code.');
    }

    _setBusy(true);
    try {
      await _apiClient.postMfa(
        'verify',
        <String, dynamic>{
          if (cleanCode.isNotEmpty) 'code': cleanCode,
          if (cleanBackup.isNotEmpty) 'backupCode': cleanBackup,
        },
      );
      if (_profile != null) {
        _profile = _profile!.copyWith(mfaEnabled: true, mfaRequired: false);
      }
      notifyListeners();
    } finally {
      _setBusy(false);
    }
  }

  /// Memperbarui status MFA lokal setelah aktivasi/nonaktivasi di Profil.
  void updateLocalMfaState({required bool enabled, required bool mfaRequired}) {
    if (_profile == null) return;
    _profile = _profile!.copyWith(
      mfaEnabled: enabled,
      mfaRequired: mfaRequired,
    );
    notifyListeners();
  }

  /// Menyegarkan ulang user Firebase dan sinkronisasi `/api/bootstrap`.
  Future<void> refreshSession() async {
    final user = _firebaseAuth.currentUser;
    if (user == null) return;
    _setBusy(true);
    try {
      await user.reload();
      await user.getIdToken(true);
      final refreshedUser = _firebaseAuth.currentUser ?? user;
      _currentUser = refreshedUser;
      _profile = await _syncViaBootstrap(refreshedUser);
      notifyListeners();
    } finally {
      _setBusy(false);
    }
  }

  /// Keluar dari Firebase Auth dan Google Sign-In.
  Future<void> signOut() async {
    _setBusy(true);
    try {
      try {
        await _ensureGoogleInitialized();
        await GoogleSignIn.instance.signOut();
      } catch (_) {}
      await _firebaseAuth.signOut();
      _currentUser = null;
      _profile = null;
      _errorMessage = null;
      notifyListeners();
    } finally {
      _setBusy(false);
    }
  }

  void _setBusy(bool value) {
    _isBusy = value;
    notifyListeners();
  }

  String _mapGoogleSignInError(GoogleSignInException e) {
    final detail = '${e.description ?? ''} ${e.details ?? ''}'.toLowerCase();
    switch (e.code) {
      case GoogleSignInExceptionCode.canceled:
        return 'Login Google dibatalkan oleh pengguna.';
      case GoogleSignInExceptionCode.interrupted:
        return 'Proses login Google terinterupsi. Silakan coba kembali.';
      case GoogleSignInExceptionCode.clientConfigurationError:
      case GoogleSignInExceptionCode.providerConfigurationError:
        return 'Konfigurasi Google Sign-In Android belum valid (pastikan SHA-1 & google-services.json sesuai).';
      default:
        if (detail.contains('apiexception: 10') ||
            detail.contains('developer_error') ||
            detail.contains('10:')) {
          return 'Konfigurasi OAuth Android (ApiException: 10) tidak cocok. Periksa SHA-1 di Firebase Console & google-services.json.';
        }
        return e.description?.isNotEmpty == true
            ? 'Gagal login dengan Google: ${e.description}'
            : 'Gagal login dengan Google (${e.code.name}).';
    }
  }

  String _mapFirebaseAuthError(FirebaseAuthException e) {
    switch (e.code) {
      case 'invalid-credential':
      case 'wrong-password':
        return 'Kredensial salah: Alamat email atau kata sandi tidak cocok.';
      case 'user-not-found':
        return 'Akun belum terdaftar. Silakan pilih tab Daftar terlebih dahulu.';
      case 'email-already-in-use':
        return 'Alamat email ini sudah terdaftar. Silakan langsung masuk.';
      case 'weak-password':
        return 'Kata sandi terlalu pendek (minimal 6 karakter).';
      case 'invalid-email':
        return 'Format alamat email tidak valid.';
      case 'too-many-requests':
        return 'Terlalu banyak percobaan gagal. Silakan tunggu beberapa saat.';
      case 'network-request-failed':
        return 'Koneksi internet bermasalah saat menghubungi Firebase Auth.';
      default:
        return e.message ?? 'Terjadi kesalahan autentikasi (${e.code}).';
    }
  }

  @override
  void dispose() {
    _authSub?.cancel();
    super.dispose();
  }
}
