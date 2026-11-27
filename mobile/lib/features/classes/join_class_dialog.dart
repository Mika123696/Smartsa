import 'package:flutter/material.dart';

import '../../core/services/api_client.dart';
import '../../core/theme/app_theme.dart';

/// Hasil pemanggilan dialog gabung kelas `/api/join-class`.
class JoinClassOutcome {
  const JoinClassOutcome({
    required this.joined,
    required this.alreadyMember,
    required this.pendingApproval,
    required this.classId,
    required this.status,
  });

  final bool joined;
  final bool alreadyMember;
  final bool pendingApproval;
  final String classId;
  final String status;
}

/// Menampilkan dialog input kode kelas dan memanggil `POST /api/join-class`.
Future<JoinClassOutcome?> showJoinClassDialog({
  required BuildContext context,
  required ApiClient apiClient,
}) {
  return showDialog<JoinClassOutcome>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => _JoinClassDialog(apiClient: apiClient),
  );
}

class _JoinClassDialog extends StatefulWidget {
  const _JoinClassDialog({required this.apiClient});

  final ApiClient apiClient;

  @override
  State<_JoinClassDialog> createState() => _JoinClassDialogState();
}

class _JoinClassDialogState extends State<_JoinClassDialog> {
  final _codeCtrl = TextEditingController();
  bool _submitting = false;
  String? _errorText;

  static final RegExp _codeRegex = RegExp(r'^[A-Z0-9]{6,12}$');

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final cleanCode = _codeCtrl.text.trim().toUpperCase();
    if (!_codeRegex.hasMatch(cleanCode)) {
      setState(() {
        _errorText = 'Kode kelas wajib 6–12 karakter alfanumerik kapital.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _errorText = null;
    });

    try {
      final data = await widget.apiClient.postJoinClass(cleanCode);
      if (!mounted) return;
      Navigator.of(context).pop(
        JoinClassOutcome(
          joined: data['joined'] == true,
          alreadyMember: data['alreadyMember'] == true,
          pendingApproval: data['pendingApproval'] == true,
          classId: (data['classId'] ?? '').toString(),
          status: (data['status'] ?? 'approved').toString(),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _errorText = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorText = 'Gagal bergabung ke kelas: $e';
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

    return AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.group_add_outlined, color: AppColors.amber),
          SizedBox(width: 10),
          Expanded(child: Text('Gabung Kelas dengan Kode')),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Masukkan kode kelas 6–12 karakter dari dosen. Akun domain institusional terverifikasi otomatis disetujui, sedangkan akun umum menunggu persetujuan dosen.',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _codeCtrl,
            autofocus: true,
            enabled: !_submitting,
            textCapitalization: TextCapitalization.characters,
            maxLength: 12,
            decoration: const InputDecoration(
              labelText: 'Kode Kelas',
              hintText: 'Contoh: PBO101',
              prefixIcon: Icon(Icons.qr_code_2_outlined),
              counterText: '',
            ),
            onSubmitted: (_) => _submitting ? null : _submit(),
          ),
          if (_errorText != null) ...[
            const SizedBox(height: 10),
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
                _errorText!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.rose,
                ),
              ),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(),
          child: const Text('Batal'),
        ),
        ElevatedButton(
          onPressed: _submitting ? null : _submit,
          child: _submitting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.black,
                  ),
                )
              : const Text('Gabung'),
        ),
      ],
    );
  }
}
