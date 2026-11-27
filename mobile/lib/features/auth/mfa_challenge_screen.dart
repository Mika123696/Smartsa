import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/brand_logo.dart';
import 'auth_controller.dart';

/// Gerbang wajib Verifikasi 2FA (TOTP / Backup Code) yang mengunci seluruh
/// navigasi utama sebelum `POST /api/mfa` (`action: 'verify'`) berhasil.
class MfaChallengeScreen extends StatefulWidget {
  const MfaChallengeScreen({
    super.key,
    required this.authController,
  });

  final AuthController authController;

  @override
  State<MfaChallengeScreen> createState() => _MfaChallengeScreenState();
}

class _MfaChallengeScreenState extends State<MfaChallengeScreen> {
  final _codeCtrl = TextEditingController();
  bool _useBackupMode = false;
  bool _submitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  void _toggleMode() {
    setState(() {
      _useBackupMode = !_useBackupMode;
      _codeCtrl.clear();
      _errorMessage = null;
    });
  }

  Future<void> _submit() async {
    final cleaned = _codeCtrl.text.trim();
    if (cleaned.isEmpty) {
      setState(() {
        _errorMessage = _useBackupMode
            ? 'Masukkan satu Backup Code darurat Anda.'
            : 'Masukkan kode 6 digit dari aplikasi Authenticator.';
      });
      return;
    }

    if (!_useBackupMode && !RegExp(r'^\d{6}$').hasMatch(cleaned)) {
      setState(() {
        _errorMessage = 'Kode Authenticator harus berupa 6 digit angka.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _errorMessage = null;
    });

    try {
      await widget.authController.verifyMfaChallenge(
        code: _useBackupMode ? null : cleaned,
        backupCode: _useBackupMode ? cleaned : null,
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = e.toString().replaceFirst('ApiException', 'Error');
      });
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final email = widget.authController.profile?.email ??
        widget.authController.currentUser?.email ??
        '';

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          const BrandLogo(size: 28, glow: false),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '// TWO-FACTOR SECURITY GATE',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    color: isDark
                                        ? AppColors.amber
                                        : AppColors.amberDark,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 1.0,
                                  ),
                                ),
                                Text(
                                  'Verifikasi 2FA (TOTP)',
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: AppColors.amber.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Icon(
                              Icons.verified_user_outlined,
                              color: isDark
                                  ? AppColors.amber
                                  : AppColors.amberDark,
                            ),
                          ),
                        ],
                      ),
                      const Divider(height: 24),
                      Text(
                        'Akun ini dilindungi Autentikasi Dua Faktor. Verifikasi kode dari Google Authenticator / Authy atau gunakan Backup Code untuk melanjutkan.',
                        style: theme.textTheme.bodySmall,
                      ),
                      if (email.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          email,
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontFamily: 'monospace',
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.7),
                          ),
                        ),
                      ],
                      const SizedBox(height: 14),
                      if (_errorMessage != null) ...[
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.rose.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: AppColors.rose.withValues(alpha: 0.4),
                            ),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(
                                Icons.error_outline,
                                size: 18,
                                color: AppColors.rose,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _errorMessage!,
                                  style: theme.textTheme.bodySmall,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 14),
                      ],
                      TextField(
                        controller: _codeCtrl,
                        autofocus: true,
                        keyboardType: _useBackupMode
                            ? TextInputType.text
                            : TextInputType.number,
                        maxLength: _useBackupMode ? 16 : 6,
                        decoration: InputDecoration(
                          labelText: _useBackupMode
                              ? 'Masukkan 1 Backup Code Darurat'
                              : 'Kode Authenticator (6 Digit)',
                          hintText: _useBackupMode ? 'XXXX-XXXX' : '000000',
                          prefixIcon: const Icon(Icons.key_outlined),
                          counterText: '',
                        ),
                        onSubmitted: (_) => _submitting ? null : _submit(),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        height: 46,
                        child: ElevatedButton(
                          onPressed: _submitting ? null : _submit,
                          child: _submitting
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.black,
                                  ),
                                )
                              : const Text('VERIFIKASI & MASUK LMS'),
                        ),
                      ),
                      const SizedBox(height: 14),
                      const Divider(),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          TextButton.icon(
                            onPressed: _submitting ? null : _toggleMode,
                            icon: const Icon(Icons.sync, size: 16),
                            label: Text(
                              _useBackupMode
                                  ? 'Gunakan Kode TOTP'
                                  : 'Gunakan Backup Code',
                            ),
                          ),
                          TextButton.icon(
                            onPressed: _submitting
                                ? null
                                : () => widget.authController.signOut(),
                            icon: const Icon(
                              Icons.logout,
                              size: 16,
                              color: AppColors.rose,
                            ),
                            label: const Text(
                              'Keluar',
                              style: TextStyle(color: AppColors.rose),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
