import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/brand_logo.dart';
import 'auth_controller.dart';

enum _AuthMode { login, register, forgot }

/// Layar autentikasi Smartsa LMS (Login Email, Registrasi, Lupa Sandi, & Google Sign-In).
class AuthScreen extends StatefulWidget {
  const AuthScreen({
    super.key,
    required this.authController,
  });

  final AuthController authController;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _institutionCtrl = TextEditingController();
  final _nimCtrl = TextEditingController();

  _AuthMode _mode = _AuthMode.login;
  bool _obscurePassword = true;
  bool _submitting = false;
  String? _feedbackText;
  bool _feedbackIsError = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _nameCtrl.dispose();
    _institutionCtrl.dispose();
    _nimCtrl.dispose();
    super.dispose();
  }

  void _switchMode(_AuthMode nextMode) {
    setState(() {
      _mode = nextMode;
      _feedbackText = null;
      _feedbackIsError = false;
    });
  }

  Future<void> _submitForm() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _submitting = true;
      _feedbackText = null;
      _feedbackIsError = false;
    });

    try {
      if (_mode == _AuthMode.login) {
        await widget.authController.signInWithEmail(
          email: _emailCtrl.text,
          password: _passwordCtrl.text,
        );
      } else if (_mode == _AuthMode.register) {
        await widget.authController.registerWithEmail(
          email: _emailCtrl.text,
          password: _passwordCtrl.text,
          displayName: _nameCtrl.text,
          institution: _institutionCtrl.text,
          nim: _nimCtrl.text,
        );
      } else {
        await widget.authController.sendPasswordReset(_emailCtrl.text);
        if (!mounted) return;
        setState(() {
          _feedbackIsError = false;
          _feedbackText =
              'Tautan pemulihan kata sandi telah dikirim ke email Anda.';
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _feedbackIsError = true;
        _feedbackText = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  Future<void> _handleGoogleSignIn() async {
    setState(() {
      _submitting = true;
      _feedbackText = null;
      _feedbackIsError = false;
    });

    try {
      await widget.authController.signInWithGoogle();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _feedbackIsError = true;
        _feedbackText = e.toString().replaceFirst('Exception: ', '');
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

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      height: 4,
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            AppColors.amber,
                            AppColors.amberLight,
                            AppColors.amber,
                          ],
                        ),
                        borderRadius: BorderRadius.vertical(
                          top: Radius.circular(14),
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(20),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              children: [
                                const BrandLogo(size: 32),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '// SMARTSA ACCESS PORTAL',
                                        style: theme.textTheme.labelSmall
                                            ?.copyWith(
                                              color: isDark
                                                  ? AppColors.amber
                                                  : AppColors.amberDark,
                                              fontWeight: FontWeight.w800,
                                              letterSpacing: 1.1,
                                            ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        _mode == _AuthMode.login
                                            ? 'Masuk ke Smartsa LMS'
                                            : _mode == _AuthMode.register
                                            ? 'Daftarkan Akun Baru'
                                            : 'Pemulihan Kata Sandi',
                                        style: theme.textTheme.titleLarge
                                            ?.copyWith(
                                              fontWeight: FontWeight.w800,
                                            ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            SegmentedButton<_AuthMode>(
                              segments: const [
                                ButtonSegment(
                                  value: _AuthMode.login,
                                  label: Text('Masuk'),
                                ),
                                ButtonSegment(
                                  value: _AuthMode.register,
                                  label: Text('Daftar'),
                                ),
                                ButtonSegment(
                                  value: _AuthMode.forgot,
                                  label: Text('Lupa Sandi'),
                                ),
                              ],
                              selected: <_AuthMode>{_mode},
                              onSelectionChanged: _submitting
                                  ? null
                                  : (selection) => _switchMode(selection.first),
                            ),
                            const SizedBox(height: 16),
                            if (_feedbackText != null) ...[
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: (_feedbackIsError
                                          ? AppColors.rose
                                          : AppColors.emerald)
                                      .withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: (_feedbackIsError
                                            ? AppColors.rose
                                            : AppColors.emerald)
                                        .withValues(alpha: 0.4),
                                  ),
                                ),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Icon(
                                      _feedbackIsError
                                          ? Icons.error_outline
                                          : Icons.check_circle_outline,
                                      size: 18,
                                      color: _feedbackIsError
                                          ? AppColors.rose
                                          : AppColors.emerald,
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        _feedbackText!,
                                        style: theme.textTheme.bodySmall,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 14),
                            ],
                            if (_mode == _AuthMode.register) ...[
                              TextFormField(
                                controller: _nameCtrl,
                                textInputAction: TextInputAction.next,
                                decoration: const InputDecoration(
                                  labelText: 'Nama Lengkap',
                                  prefixIcon: Icon(Icons.person_outline),
                                ),
                                validator: (v) {
                                  if (_mode == _AuthMode.register &&
                                      (v == null || v.trim().isEmpty)) {
                                    return 'Nama lengkap wajib diisi.';
                                  }
                                  return null;
                                },
                              ),
                              const SizedBox(height: 12),
                            ],
                            TextFormField(
                              controller: _emailCtrl,
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: _mode == _AuthMode.forgot
                                  ? TextInputAction.done
                                  : TextInputAction.next,
                              decoration: const InputDecoration(
                                labelText: 'Email Akademik / Umum',
                                hintText: 'nama@kampus.ac.id',
                                prefixIcon: Icon(Icons.mail_outline),
                              ),
                              validator: (v) {
                                final text = v?.trim() ?? '';
                                if (text.isEmpty || !text.contains('@')) {
                                  return 'Masukkan alamat email yang valid.';
                                }
                                return null;
                              },
                            ),
                            if (_mode != _AuthMode.forgot) ...[
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: _passwordCtrl,
                                obscureText: _obscurePassword,
                                textInputAction: _mode == _AuthMode.register
                                    ? TextInputAction.next
                                    : TextInputAction.done,
                                decoration: InputDecoration(
                                  labelText: 'Kata Sandi',
                                  prefixIcon: const Icon(Icons.lock_outline),
                                  suffixIcon: IconButton(
                                    icon: Icon(
                                      _obscurePassword
                                          ? Icons.visibility_outlined
                                          : Icons.visibility_off_outlined,
                                    ),
                                    onPressed: () {
                                      setState(() {
                                        _obscurePassword = !_obscurePassword;
                                      });
                                    },
                                  ),
                                ),
                                validator: (v) {
                                  if (_mode == _AuthMode.forgot) return null;
                                  final pass = v ?? '';
                                  if (pass.isEmpty) {
                                    return 'Kata sandi wajib diisi.';
                                  }
                                  if (_mode == _AuthMode.register &&
                                      pass.length < 6) {
                                    return 'Kata sandi minimal 6 karakter.';
                                  }
                                  return null;
                                },
                              ),
                            ],
                            if (_mode == _AuthMode.register) ...[
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: _nimCtrl,
                                textInputAction: TextInputAction.next,
                                decoration: const InputDecoration(
                                  labelText: 'NIM (Opsional)',
                                  prefixIcon: Icon(Icons.badge_outlined),
                                ),
                              ),
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: _institutionCtrl,
                                textInputAction: TextInputAction.done,
                                decoration: const InputDecoration(
                                  labelText: 'Institusi / Kampus (Opsional)',
                                  hintText: 'Universitas Negeri Surabaya',
                                  prefixIcon: Icon(Icons.school_outlined),
                                ),
                              ),
                            ],
                            const SizedBox(height: 18),
                            SizedBox(
                              height: 46,
                              child: ElevatedButton(
                                onPressed: _submitting ? null : _submitForm,
                                child: _submitting
                                    ? const SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.black,
                                        ),
                                      )
                                    : Text(
                                        _mode == _AuthMode.login
                                            ? 'Masuk ke LMS'
                                            : _mode == _AuthMode.register
                                            ? 'Daftarkan Akun'
                                            : 'Kirim Tautan Reset',
                                      ),
                              ),
                            ),
                            if (_mode != _AuthMode.forgot) ...[
                              const SizedBox(height: 14),
                              Row(
                                children: [
                                  const Expanded(child: Divider()),
                                  Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                    ),
                                    child: Text(
                                      'atau',
                                      style: theme.textTheme.bodySmall,
                                    ),
                                  ),
                                  const Expanded(child: Divider()),
                                ],
                              ),
                              const SizedBox(height: 14),
                              SizedBox(
                                height: 46,
                                child: OutlinedButton.icon(
                                  onPressed:
                                      _submitting ? null : _handleGoogleSignIn,
                                  icon: const Icon(Icons.g_mobiledata, size: 26),
                                  label: const Text('Lanjutkan dengan Google'),
                                  style: OutlinedButton.styleFrom(
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
