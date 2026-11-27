import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/models/user_profile.dart';
import '../../core/services/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_controller.dart';

enum _MfaSetupStep { idle, scan, backup }

/// Layar Profil, Tema Gelap/Terang persisten, Logout, dan Manajemen 2FA TOTP.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({
    super.key,
    required this.profile,
    required this.authController,
    required this.themeController,
    required this.apiClient,
  });

  final UserProfile profile;
  final AuthController authController;
  final ThemeController themeController;
  final ApiClient apiClient;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _confirmCodeCtrl = TextEditingController();

  bool? _mfaServerEnabled;
  int? _backupCodesRemaining;
  _MfaSetupStep _setupStep = _MfaSetupStep.idle;
  String _otpauthUri = '';
  String _manualKey = '';
  List<String> _backupCodes = const <String>[];
  bool _mfaBusy = false;
  String? _mfaError;

  bool get _isMfaEnabled => _mfaServerEnabled ?? widget.profile.mfaEnabled;

  @override
  void initState() {
    super.initState();
    _loadMfaStatus();
  }

  @override
  void dispose() {
    _confirmCodeCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadMfaStatus() async {
    try {
      final data = await widget.apiClient.postMfa('status');
      if (!mounted) return;
      setState(() {
        _mfaServerEnabled = data['enabled'] == true;
        final rem = data['backupCodesRemaining'];
        _backupCodesRemaining = rem is num ? rem.toInt() : null;
      });
    } catch (_) {
      // Fallback ke nilai `profile.mfaEnabled` bila offline.
    }
  }

  Future<void> _copyToClipboard(String text, String label) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$label disalin ke clipboard.')),
    );
  }

  Future<void> _startMfaSetup() async {
    setState(() {
      _mfaBusy = true;
      _mfaError = null;
    });

    try {
      final data = await widget.apiClient.postMfa('setup');
      if (!mounted) return;
      setState(() {
        _otpauthUri = (data['otpauthUri'] ?? '').toString();
        _manualKey = (data['manualKey'] ?? '').toString();
        _confirmCodeCtrl.clear();
        _backupCodes = const <String>[];
        _setupStep = _MfaSetupStep.scan;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _mfaError = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _mfaError = 'Gagal memulai aktivasi 2FA: $e');
    } finally {
      if (mounted) {
        setState(() => _mfaBusy = false);
      }
    }
  }

  void _cancelMfaSetup() {
    setState(() {
      _setupStep = _MfaSetupStep.idle;
      _otpauthUri = '';
      _manualKey = '';
      _confirmCodeCtrl.clear();
      _mfaError = null;
    });
  }

  Future<void> _confirmMfaSetup() async {
    final cleanCode = _confirmCodeCtrl.text.replaceAll(RegExp(r'\s+'), '');
    if (!RegExp(r'^\d{6}$').hasMatch(cleanCode)) {
      setState(() {
        _mfaError = 'Masukkan kode 6 digit yang valid dari Authenticator.';
      });
      return;
    }

    setState(() {
      _mfaBusy = true;
      _mfaError = null;
    });

    try {
      final data = await widget.apiClient.postMfa('confirm', <String, dynamic>{
        'code': cleanCode,
      });
      if (!mounted) return;

      final rawCodes = data['backupCodes'];
      final codes = rawCodes is List
          ? rawCodes.map((e) => e.toString()).toList(growable: false)
          : const <String>[];
      final rem = data['backupCodesRemaining'];

      setState(() {
        _mfaServerEnabled = true;
        _backupCodesRemaining = rem is num ? rem.toInt() : codes.length;
        _backupCodes = codes;
        _otpauthUri = '';
        _manualKey = '';
        _confirmCodeCtrl.clear();
        _setupStep = _MfaSetupStep.backup;
      });

      widget.authController.updateLocalMfaState(
        enabled: true,
        mfaRequired: false,
      );

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Autentikasi Dua Faktor (2FA) berhasil diaktifkan!'),
          backgroundColor: AppColors.emerald,
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _mfaError = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _mfaError = 'Gagal mengonfirmasi 2FA: $e');
    } finally {
      if (mounted) {
        setState(() => _mfaBusy = false);
      }
    }
  }

  Future<void> _openDisableMfaDialog() async {
    final disableCtrl = TextEditingController();
    String? dialogError;
    bool busy = false;

    final disabled = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Nonaktifkan 2FA (TOTP)'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Masukkan kode Authenticator 6 digit aktif atau 1 Backup Code darurat untuk menonaktifkan perlindungan 2FA.',
              ),
              const SizedBox(height: 12),
              TextField(
                controller: disableCtrl,
                autofocus: true,
                enabled: !busy,
                decoration: const InputDecoration(
                  labelText: 'Kode 6 Digit / Backup Code',
                  hintText: '000000 atau XXXX-XXXX',
                ),
              ),
              if (dialogError != null) ...[
                const SizedBox(height: 10),
                Text(
                  dialogError!,
                  style: const TextStyle(color: AppColors.rose, fontSize: 12),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: busy ? null : () => Navigator.of(ctx).pop(false),
              child: const Text('Batal'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.rose,
                foregroundColor: Colors.white,
              ),
              onPressed: busy
                  ? null
                  : () async {
                      final code = disableCtrl.text.trim();
                      if (code.isEmpty) {
                        setDialogState(() {
                          dialogError = 'Kode verifikasi wajib diisi.';
                        });
                        return;
                      }
                      setDialogState(() {
                        busy = true;
                        dialogError = null;
                      });
                      try {
                        await widget.apiClient.postMfa(
                          'disable',
                          <String, dynamic>{'code': code},
                        );
                        if (ctx.mounted) Navigator.of(ctx).pop(true);
                      } on ApiException catch (e) {
                        if (ctx.mounted) {
                          setDialogState(() {
                            busy = false;
                            dialogError = e.message;
                          });
                        }
                      } catch (e) {
                        if (ctx.mounted) {
                          setDialogState(() {
                            busy = false;
                            dialogError = 'Gagal menonaktifkan 2FA: $e';
                          });
                        }
                      }
                    },
              child: busy
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Nonaktifkan'),
            ),
          ],
        ),
      ),
    );

    disableCtrl.dispose();

    if (disabled == true && mounted) {
      setState(() {
        _mfaServerEnabled = false;
        _backupCodesRemaining = 0;
        _setupStep = _MfaSetupStep.idle;
        _backupCodes = const <String>[];
        _mfaError = null;
      });
      widget.authController.updateLocalMfaState(
        enabled: false,
        mfaRequired: false,
      );
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Autentikasi Dua Faktor dinonaktifkan.')),
      );
    }
  }

  Future<void> _confirmSignOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Keluar dari Smartsa LMS'),
        content: const Text('Apakah Anda yakin ingin mengakhiri sesi ini?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.rose,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Keluar'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await widget.authController.signOut();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = widget.themeController.isDark;
    final profile = widget.profile;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Informasi Akun & Akademik
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 26,
                      backgroundColor: AppColors.amber.withValues(alpha: 0.18),
                      child: Text(
                        profile.effectiveName[0].toUpperCase(),
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: isDark ? AppColors.amber : AppColors.amberDark,
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            profile.effectiveName,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${profile.roleLabel} • ${profile.accountTypeLabel}',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: isDark
                                  ? AppColors.amber
                                  : AppColors.amberDark,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Segarkan Profil',
                      onPressed: () => widget.authController.refreshSession(),
                      icon: const Icon(Icons.refresh),
                    ),
                  ],
                ),
                const Divider(height: 24),
                _InfoRow(label: 'Email', value: profile.email),
                _InfoRow(
                  label: profile.academicIdLabel,
                  value: profile.academicIdValue.isEmpty
                      ? 'Belum diisi'
                      : profile.academicIdValue,
                ),
                _InfoRow(label: 'Institusi', value: profile.institution),
                _InfoRow(
                  label: 'Verifikasi Email',
                  value: profile.emailVerified
                      ? 'Terverifikasi'
                      : 'Belum Terverifikasi',
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),

        // Mode Tampilan (Gelap / Terang) Persisten
        Card(
          child: SwitchListTile(
            value: isDark,
            onChanged: (_) => widget.themeController.toggleTheme(),
            secondary: Icon(
              isDark ? Icons.dark_mode_outlined : Icons.light_mode_outlined,
              color: isDark ? AppColors.amber : AppColors.amberDark,
            ),
            title: const Text(
              'Mode Gelap (Tactical Dark)',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
            ),
            subtitle: Text(
              isDark
                  ? 'Tema gelap aktif dan tersimpan di perangkat.'
                  : 'Tema terang aktif dan tersimpan di perangkat.',
              style: theme.textTheme.bodySmall,
            ),
          ),
        ),
        const SizedBox(height: 14),

        // Autentikasi Dua Faktor (2FA TOTP)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.security_outlined,
                      color: isDark ? AppColors.amber : AppColors.amberDark,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Autentikasi Dua Faktor (2FA TOTP)',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: (_isMfaEnabled
                                ? AppColors.emerald
                                : AppColors.amber)
                            .withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        _isMfaEnabled ? 'AKTIF' : 'NONAKTIF',
                        style: TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: _isMfaEnabled
                              ? AppColors.emerald
                              : AppColors.amber,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Lindungi akun Anda dengan kode OTP 6 digit dari Google Authenticator atau Authy.',
                  style: theme.textTheme.bodySmall,
                ),
                if (_isMfaEnabled && _backupCodesRemaining != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Sisa Backup Code darurat: $_backupCodesRemaining',
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontFamily: 'monospace',
                      color: AppColors.emerald,
                    ),
                  ),
                ],
                if (_mfaError != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.rose.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: AppColors.rose.withValues(alpha: 0.4),
                      ),
                    ),
                    child: Text(
                      _mfaError!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.rose,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 14),

                // Step 1: Idle -> tombol Aktifkan atau Nonaktifkan
                if (_setupStep == _MfaSetupStep.idle) ...[
                  if (_isMfaEnabled)
                    OutlinedButton.icon(
                      onPressed: _mfaBusy ? null : _openDisableMfaDialog,
                      icon: const Icon(Icons.gpp_bad_outlined, color: AppColors.rose),
                      label: const Text(
                        'Nonaktifkan 2FA',
                        style: TextStyle(color: AppColors.rose),
                      ),
                    )
                  else
                    ElevatedButton.icon(
                      onPressed: _mfaBusy ? null : _startMfaSetup,
                      icon: const Icon(Icons.qr_code_2),
                      label: Text(_mfaBusy ? 'Menyiapkan...' : 'Aktifkan 2FA'),
                    ),
                ],

                // Step 2: Scan QR + Salin Kunci Manual + Konfirmasi 6 Digit
                if (_setupStep == _MfaSetupStep.scan) ...[
                  if (_otpauthUri.isNotEmpty)
                    Center(
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: QrImageView(
                          data: _otpauthUri,
                          size: 184,
                          errorCorrectionLevel: QrErrorCorrectLevel.M,
                        ),
                      ),
                    ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: theme.scaffoldBackgroundColor,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Kunci Manual (Secret)',
                                style: theme.textTheme.labelSmall,
                              ),
                              const SizedBox(height: 2),
                              SelectableText(
                                _manualKey,
                                style: const TextStyle(
                                  fontFamily: 'monospace',
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          tooltip: 'Salin Kunci Manual',
                          onPressed: _manualKey.isEmpty
                              ? null
                              : () => _copyToClipboard(
                                  _manualKey,
                                  'Kunci manual',
                                ),
                          icon: const Icon(Icons.copy, size: 18),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _confirmCodeCtrl,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    decoration: const InputDecoration(
                      labelText: 'Masukkan Kode Konfirmasi 6 Digit',
                      hintText: '000000',
                      prefixIcon: Icon(Icons.pin_outlined),
                      counterText: '',
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: _mfaBusy ? null : _cancelMfaSetup,
                          child: const Text('Batal'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: _mfaBusy ? null : _confirmMfaSetup,
                          child: Text(
                            _mfaBusy ? 'Memverifikasi...' : 'Konfirmasi',
                          ),
                        ),
                      ),
                    ],
                  ),
                ],

                // Step 3: Tampilkan 6 Backup Codes sekali pakai
                if (_setupStep == _MfaSetupStep.backup) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.emerald.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: AppColors.emerald.withValues(alpha: 0.35),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Simpan 6 Backup Code Darurat ini (masing-masing hanya 1x pakai):',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: _backupCodes
                              .map(
                                (code) => Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 6,
                                  ),
                                  decoration: BoxDecoration(
                                    color: theme.scaffoldBackgroundColor,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: SelectableText(
                                    code,
                                    style: const TextStyle(
                                      fontFamily: 'monospace',
                                      fontWeight: FontWeight.w800,
                                      fontSize: 12,
                                    ),
                                  ),
                                ),
                              )
                              .toList(growable: false),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: _backupCodes.isEmpty
                                    ? null
                                    : () => _copyToClipboard(
                                        _backupCodes.join('\n'),
                                        'Backup codes',
                                      ),
                                icon: const Icon(Icons.copy, size: 16),
                                label: const Text('Salin Semua'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: ElevatedButton(
                                onPressed: () {
                                  setState(() {
                                    _setupStep = _MfaSetupStep.idle;
                                    _backupCodes = const <String>[];
                                  });
                                },
                                child: const Text('Selesai'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        // Tombol Logout
        SizedBox(
          height: 48,
          child: OutlinedButton.icon(
            onPressed: _confirmSignOut,
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.rose,
              side: BorderSide(color: AppColors.rose.withValues(alpha: 0.5)),
            ),
            icon: const Icon(Icons.logout),
            label: const Text(
              'Keluar dari Akun',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ),
        const SizedBox(height: 20),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: theme.textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
