import 'package:flutter/material.dart';

import '../../core/models/attendance_models.dart';
import '../../core/models/lms_class.dart';
import '../../core/models/user_profile.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/attendance_qr_utils.dart';
import 'qr_scanner_screen.dart';

/// Komponen check-in presensi mahasiswa bersama (Scan QR Kamera + Input Kode Manual).
/// Dipakai ulang pada `AttendanceTab` maupun `QuickAttendanceSheet` agar logika validasi seragam.
class StudentAttendanceCheckInCard extends StatefulWidget {
  const StudentAttendanceCheckInCard({
    super.key,
    required this.lmsClass,
    required this.profile,
    required this.firestoreService,
    required this.activeSession,
    this.onCheckInSuccess,
  });

  final LmsClass lmsClass;
  final UserProfile profile;
  final FirestoreService firestoreService;
  final AttendanceSession? activeSession;
  final ValueChanged<AttendanceCheckInResult>? onCheckInSuccess;

  @override
  State<StudentAttendanceCheckInCard> createState() =>
      _StudentAttendanceCheckInCardState();
}

class _StudentAttendanceCheckInCardState
    extends State<StudentAttendanceCheckInCard> {
  final _codeCtrl = TextEditingController();
  bool _submitting = false;
  AttendanceCheckInResult? _lastResult;

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _openQrScanner() async {
    if (_submitting) return;
    final scannedCode = await Navigator.of(context).push<String>(
      MaterialPageRoute<String>(
        builder: (_) => QrScannerScreen(
          classTitle: widget.lmsClass.displayTitle,
        ),
      ),
    );
    if (scannedCode == null || scannedCode.trim().isEmpty || !mounted) return;
    _codeCtrl.text = scannedCode;
    await _submitAttendanceCode(scannedCode);
  }

  Future<void> _submitAttendanceCode(String rawInput) async {
    if (_submitting) return;
    final normalized = AttendanceQrUtils.parsePayload(rawInput);
    if (!AttendanceQrUtils.isValidSessionCode(normalized)) {
      setState(() {
        _lastResult = const AttendanceCheckInResult(
          success: false,
          invalidCode: true,
          message:
              'Masukkan kode sesi atau pindai QR Code presensi yang valid terlebih dahulu.',
        );
      });
      return;
    }

    setState(() {
      _submitting = true;
      _lastResult = null;
    });

    try {
      final result = await widget.firestoreService.recordMeetingAttendance(
        classId: widget.lmsClass.id,
        uid: widget.profile.uid,
        studentName: widget.profile.effectiveName,
        rawQrOrCode: normalized,
      );
      if (!mounted) return;
      setState(() {
        _lastResult = result;
        if (result.success) {
          _codeCtrl.clear();
        }
      });
      if (result.success) {
        widget.onCheckInSuccess?.call(result);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _lastResult = AttendanceCheckInResult(
          success: false,
          message: 'Gagal mencatat presensi ke Firestore: $e',
        );
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
    final sess = widget.activeSession;
    final isOpen = sess != null && sess.isCurrentlyOpen;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.qr_code_scanner,
                  size: 18,
                  color: AppColors.amber,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'PRESENSI PERTEMUAN (+6%)',
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w800,
                      color: AppColors.amber,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isOpen
                    ? AppColors.emerald.withValues(alpha: 0.12)
                    : AppColors.amber.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: isOpen
                      ? AppColors.emerald.withValues(alpha: 0.45)
                      : AppColors.amber.withValues(alpha: 0.4),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    isOpen
                        ? Icons.radio_button_checked
                        : Icons.info_outline,
                    size: 18,
                    color: isOpen ? AppColors.emerald : AppColors.amberDark,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      isOpen
                          ? 'Sesi presensi Pertemuan ${sess.meetingNo.toString().padLeft(2, '0')} sedang dibuka oleh dosen.'
                          : (sess != null && sess.isOpen && sess.isExpired)
                              ? 'Sesi presensi sebelumnya sudah kedaluwarsa. Minta dosen membuka sesi baru.'
                              : 'Dosen belum membuka sesi presensi aktif untuk kelas ini.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            ElevatedButton.icon(
              onPressed: _submitting ? null : _openQrScanner,
              icon: const Icon(Icons.camera_alt_outlined),
              label: const Text('Scan QR Kamera'),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: Divider(color: theme.dividerColor)),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Text(
                    'atau masukkan kode manual',
                    style: theme.textTheme.labelSmall,
                  ),
                ),
                Expanded(child: Divider(color: theme.dividerColor)),
              ],
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _codeCtrl,
              enabled: !_submitting,
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(
                labelText: 'Kode Sesi Dosen',
                hintText: 'Contoh: ${widget.lmsClass.code.isEmpty ? 'CLS' : widget.lmsClass.code}-M01-1234',
                prefixIcon: const Icon(Icons.key_outlined),
              ),
              onSubmitted: _submitAttendanceCode,
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: _submitting
                  ? null
                  : () => _submitAttendanceCode(_codeCtrl.text),
              icon: _submitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.check_circle_outline),
              label: Text(
                _submitting ? 'Memverifikasi...' : 'Catat Presensi (+6%)',
              ),
            ),
            if (_lastResult != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: (_lastResult!.success
                          ? AppColors.emerald
                          : AppColors.rose)
                      .withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: (_lastResult!.success
                            ? AppColors.emerald
                            : AppColors.rose)
                        .withValues(alpha: 0.45),
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      _lastResult!.success
                          ? Icons.check_circle
                          : Icons.error_outline,
                      size: 18,
                      color: _lastResult!.success
                          ? AppColors.emerald
                          : AppColors.rose,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _lastResult!.message,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: _lastResult!.success
                              ? AppColors.emerald
                              : AppColors.rose,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
