import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../core/models/attendance_models.dart';
import '../../../core/models/lms_class.dart';
import '../../../core/models/user_profile.dart';
import '../../../core/services/firestore_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/attendance_qr_utils.dart';
import '../../attendance/student_attendance_check_in_card.dart';

/// Tab Presensi QR pada [ClassDetailScreen] (Dosen/Admin membuka QR & Mode Proyektor;
/// Mahasiswa melakukan Scan QR / Input Kode Manual & melihat riwayat presensi).
class AttendanceTab extends StatefulWidget {
  const AttendanceTab({
    super.key,
    required this.lmsClass,
    required this.profile,
    required this.firestoreService,
  });

  final LmsClass lmsClass;
  final UserProfile profile;
  final FirestoreService firestoreService;

  @override
  State<AttendanceTab> createState() => _AttendanceTabState();
}

class _AttendanceTabState extends State<AttendanceTab> {
  final _customCodeCtrl = TextEditingController();

  int _selectedMeetingNo = 1;
  int _selectedDurationMins = 15;
  int? _attendeesMeetingFilter;

  bool _sessionActionLoading = false;
  String? _educatorFeedback;
  bool _educatorFeedbackError = false;

  StudentClassAttendanceSummary? _studentSummary;
  bool _loadingStudentHistory = true;
  String? _studentHistoryError;

  Timer? _countdownTicker;
  int _tickEpochMs = DateTime.now().millisecondsSinceEpoch;

  bool get _isEducatorOrAdmin =>
      widget.profile.isLecturer || widget.profile.isAdmin;

  @override
  void initState() {
    super.initState();
    if (widget.lmsClass.meetings.isNotEmpty) {
      _selectedMeetingNo = widget.lmsClass.meetings.first.order;
    }
    _countdownTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() => _tickEpochMs = DateTime.now().millisecondsSinceEpoch);
      }
    });
    if (!_isEducatorOrAdmin) {
      _loadStudentHistory();
    }
  }

  @override
  void dispose() {
    _countdownTicker?.cancel();
    _customCodeCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadStudentHistory() async {
    setState(() {
      _loadingStudentHistory = true;
      _studentHistoryError = null;
    });
    try {
      final summary = await widget.firestoreService.fetchStudentClassAttendance(
        classId: widget.lmsClass.id,
        uid: widget.profile.uid,
      );
      if (!mounted) return;
      setState(() => _studentSummary = summary);
    } catch (e) {
      if (!mounted) return;
      setState(() => _studentHistoryError = e.toString());
    } finally {
      if (mounted) {
        setState(() => _loadingStudentHistory = false);
      }
    }
  }

  Future<void> _openSession() async {
    if (_sessionActionLoading) return;
    setState(() {
      _sessionActionLoading = true;
      _educatorFeedback = null;
      _educatorFeedbackError = false;
    });

    try {
      final opened = await widget.firestoreService.openAttendanceSession(
        classId: widget.lmsClass.id,
        classCode: widget.lmsClass.code,
        meetingNo: _selectedMeetingNo,
        openedByUid: widget.profile.uid,
        durationMinutes: _selectedDurationMins,
        customCode: _customCodeCtrl.text,
      );
      if (!mounted) return;
      setState(() {
        _customCodeCtrl.clear();
        _educatorFeedback =
            'Sesi presensi Pertemuan ${opened.meetingNo} dibuka (Kode: ${opened.sessionCode}).';
        _educatorFeedbackError = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _educatorFeedback = 'Gagal membuka sesi presensi: $e';
        _educatorFeedbackError = true;
      });
    } finally {
      if (mounted) {
        setState(() => _sessionActionLoading = false);
      }
    }
  }

  Future<void> _closeSession() async {
    if (_sessionActionLoading) return;
    setState(() {
      _sessionActionLoading = true;
      _educatorFeedback = null;
      _educatorFeedbackError = false;
    });
    try {
      await widget.firestoreService.closeAttendanceSession(widget.lmsClass.id);
      if (!mounted) return;
      setState(() {
        _educatorFeedback = 'Sesi presensi kelas telah ditutup.';
        _educatorFeedbackError = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _educatorFeedback = 'Gagal menutup sesi presensi: $e';
        _educatorFeedbackError = true;
      });
    } finally {
      if (mounted) {
        setState(() => _sessionActionLoading = false);
      }
    }
  }

  void _openProjectorDialog(AttendanceSession session) {
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.92),
      builder: (dialogCtx) => _ProjectorQrDialog(
        lmsClass: widget.lmsClass,
        initialSession: session,
        sessionStream: widget.firestoreService.watchClassAttendanceSession(
          widget.lmsClass.id,
        ),
        onCloseSession: () async {
          Navigator.of(dialogCtx).pop();
          await _closeSession();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<AttendanceSession?>(
      stream: widget.firestoreService.watchClassAttendanceSession(
        widget.lmsClass.id,
      ),
      builder: (context, sessionSnap) {
        final session = sessionSnap.data;
        if (_isEducatorOrAdmin) {
          return _buildEducatorView(context, session);
        }
        return _buildStudentView(context, session);
      },
    );
  }

  Widget _buildEducatorView(BuildContext context, AttendanceSession? session) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final meetingNumbers = widget.lmsClass.meetings.isNotEmpty
        ? widget.lmsClass.meetings.map((m) => m.order).toList()
        : List<int>.generate(16, (idx) => idx + 1);
    if (!meetingNumbers.contains(_selectedMeetingNo)) {
      _selectedMeetingNo = meetingNumbers.first;
    }

    final remainingMs = (session != null && session.expiresAtMs > 0)
        ? (session.expiresAtMs - _tickEpochMs).clamp(0, 1 << 31)
        : 0;
    final isExpired =
        session != null && session.expiresAtMs > 0 && remainingMs <= 0;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_educatorFeedback != null) ...[
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: (_educatorFeedbackError
                      ? AppColors.rose
                      : AppColors.emerald)
                  .withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: (_educatorFeedbackError
                        ? AppColors.rose
                        : AppColors.emerald)
                    .withValues(alpha: 0.45),
              ),
            ),
            child: Text(
              _educatorFeedback!,
              style: TextStyle(
                color: _educatorFeedbackError
                    ? AppColors.rose
                    : AppColors.emerald,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],

        if (session != null && session.isOpen)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.qr_code_2,
                        color: AppColors.emerald,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'SESI AKTIF — PERTEMUAN ${session.meetingNo.toString().padLeft(2, '0')}',
                          style: theme.textTheme.labelMedium?.copyWith(
                            fontFamily: 'monospace',
                            fontWeight: FontWeight.w800,
                            color: AppColors.emerald,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: (isExpired
                                  ? AppColors.rose
                                  : AppColors.emerald)
                              .withValues(alpha: 0.16),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          isExpired
                              ? 'KEDALUWARSA'
                              : _formatCountdownMs(remainingMs),
                          style: TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: isExpired
                                ? AppColors.rose
                                : AppColors.emerald,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.amber, width: 2.5),
                    ),
                    child: QrImageView(
                      data: AttendanceQrUtils.buildPayload(session.sessionCode),
                      version: QrVersions.auto,
                      size: 185,
                      backgroundColor: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 14),
                  SelectableText(
                    session.sessionCode,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.8,
                      color: isDark ? AppColors.amber : AppColors.amberDark,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    alignment: WrapAlignment.center,
                    children: [
                      OutlinedButton.icon(
                        onPressed: () {
                          Clipboard.setData(
                            ClipboardData(text: session.sessionCode),
                          );
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Kode sesi presensi disalin.'),
                            ),
                          );
                        },
                        icon: const Icon(Icons.copy, size: 16),
                        label: const Text('Salin Kode'),
                      ),
                      ElevatedButton.icon(
                        onPressed: () => _openProjectorDialog(session),
                        icon: const Icon(Icons.fullscreen, size: 18),
                        label: const Text('Mode Proyektor'),
                      ),
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.rose,
                          side: const BorderSide(color: AppColors.rose),
                        ),
                        onPressed: _sessionActionLoading ? null : _closeSession,
                        icon: const Icon(Icons.cancel_outlined, size: 16),
                        label: const Text('Tutup Sesi'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          )
        else
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'BUKA SESI PRESENSI QR',
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w800,
                      color: AppColors.amber,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<int>(
                          initialValue: _selectedMeetingNo,
                          decoration: const InputDecoration(
                            labelText: 'Pertemuan',
                          ),
                          items: meetingNumbers
                              .map(
                                (meetingNo) => DropdownMenuItem<int>(
                                  value: meetingNo,
                                  child: Text(
                                    'Pertemuan ${meetingNo.toString().padLeft(2, '0')}',
                                  ),
                                ),
                              )
                              .toList(),
                          onChanged: _sessionActionLoading
                              ? null
                              : (val) {
                                  if (val != null) {
                                    setState(() => _selectedMeetingNo = val);
                                  }
                                },
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: DropdownButtonFormField<int>(
                          initialValue: _selectedDurationMins,
                          decoration: const InputDecoration(
                            labelText: 'Durasi',
                          ),
                          items: const <int>[10, 15, 30, 60]
                              .map(
                                (m) => DropdownMenuItem<int>(
                                  value: m,
                                  child: Text('$m Menit'),
                                ),
                              )
                              .toList(),
                          onChanged: _sessionActionLoading
                              ? null
                              : (val) {
                                  if (val != null) {
                                    setState(() => _selectedDurationMins = val);
                                  }
                                },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _customCodeCtrl,
                    enabled: !_sessionActionLoading,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      labelText: 'Kode Kustom (Opsional)',
                      hintText: 'Kosongkan untuk kode acak otomatis',
                    ),
                  ),
                  const SizedBox(height: 14),
                  ElevatedButton.icon(
                    onPressed: _sessionActionLoading ? null : _openSession,
                    icon: _sessionActionLoading
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.black,
                            ),
                          )
                        : const Icon(Icons.qr_code),
                    label: const Text('Buka Sesi QR Presensi'),
                  ),
                ],
              ),
            ),
          ),

        const SizedBox(height: 16),
        _buildLiveAttendeesCard(context, meetingNumbers),
      ],
    );
  }

  Widget _buildLiveAttendeesCard(
    BuildContext context,
    List<int> meetingNumbers,
  ) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: StreamBuilder<List<AttendanceRecord>>(
          stream: widget.firestoreService.watchClassAttendees(
            widget.lmsClass.id,
          ),
          builder: (context, snap) {
            final allRecords = snap.data ?? const <AttendanceRecord>[];
            final filtered = _attendeesMeetingFilter == null
                ? allRecords
                : allRecords
                      .where((r) => r.meetingNo == _attendeesMeetingFilter)
                      .toList(growable: false);

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.people_outline,
                      size: 18,
                      color: AppColors.amber,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Daftar Hadir Real-Time (${filtered.length})',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    DropdownButton<int?>(
                      value: _attendeesMeetingFilter,
                      underline: const SizedBox.shrink(),
                      items: <DropdownMenuItem<int?>>[
                        const DropdownMenuItem<int?>(
                          value: null,
                          child: Text('Semua P', style: TextStyle(fontSize: 12)),
                        ),
                        ...meetingNumbers.map(
                          (n) => DropdownMenuItem<int?>(
                            value: n,
                            child: Text(
                              'P$n',
                              style: const TextStyle(fontSize: 12),
                            ),
                          ),
                        ),
                      ],
                      onChanged: (v) {
                        setState(() => _attendeesMeetingFilter = v);
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                if (snap.connectionState == ConnectionState.waiting &&
                    !snap.hasData)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 20),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (filtered.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Text(
                      'Belum ada catatan presensi mahasiswa untuk filter ini.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall,
                    ),
                  )
                else
                  for (final att in filtered)
                    Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: theme.scaffoldBackgroundColor,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: theme.dividerColor),
                      ),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.emerald.withValues(alpha: 0.14),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              'P${att.meetingNo.toString().padLeft(2, '0')}',
                              style: const TextStyle(
                                fontFamily: 'monospace',
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                color: AppColors.emerald,
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  att.studentName,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                  ),
                                ),
                                Text(
                                  '${att.timestampLabel} • ${att.sessionCode}',
                                  style: theme.textTheme.labelSmall,
                                ),
                              ],
                            ),
                          ),
                          const Icon(
                            Icons.verified,
                            size: 16,
                            color: AppColors.emerald,
                          ),
                        ],
                      ),
                    ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildStudentView(BuildContext context, AttendanceSession? session) {
    final theme = Theme.of(context);
    final summary = _studentSummary;

    return RefreshIndicator(
      onRefresh: _loadStudentHistory,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          StudentAttendanceCheckInCard(
            lmsClass: widget.lmsClass,
            profile: widget.profile,
            firestoreService: widget.firestoreService,
            activeSession: session,
            onCheckInSuccess: (_) => _loadStudentHistory(),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.history,
                        size: 18,
                        color: AppColors.amber,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Riwayat Kehadiran Saya',
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      if (summary != null)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.emerald.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            '${summary.progressPercent}% (${summary.attendedMeetingNos.length}x)',
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: AppColors.emerald,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (_loadingStudentHistory)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 18),
                        child: CircularProgressIndicator(),
                      ),
                    )
                  else if (_studentHistoryError != null)
                    Text(
                      'Gagal memuat riwayat presensi: $_studentHistoryError',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.rose,
                      ),
                    )
                  else if (summary == null || summary.records.isEmpty)
                    Text(
                      'Belum ada presensi tercatat pada kelas ini.',
                      style: theme.textTheme.bodySmall,
                    )
                  else
                    for (final rec in summary.records)
                      Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: theme.scaffoldBackgroundColor,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: theme.dividerColor),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.check_circle,
                              size: 18,
                              color: AppColors.emerald,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    rec.meetingTitle,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13,
                                    ),
                                  ),
                                  Text(
                                    '${rec.timestampLabel} • ${rec.sessionCode}',
                                    style: theme.textTheme.labelSmall,
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              '+${rec.progressGained}%',
                              style: const TextStyle(
                                fontFamily: 'monospace',
                                fontWeight: FontWeight.w800,
                                fontSize: 11,
                                color: AppColors.emerald,
                              ),
                            ),
                          ],
                        ),
                      ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _formatCountdownMs(int ms) {
    if (ms <= 0) return '00:00';
    final totalSecs = ms ~/ 1000;
    final hrs = totalSecs ~/ 3600;
    final mins = (totalSecs % 3600) ~/ 60;
    final secs = totalSecs % 60;
    final mm = mins.toString().padLeft(2, '0');
    final ss = secs.toString().padLeft(2, '0');
    if (hrs > 0) {
      return '${hrs.toString().padLeft(2, '0')}:$mm:$ss';
    }
    return '$mm:$ss';
  }
}

class _ProjectorQrDialog extends StatefulWidget {
  const _ProjectorQrDialog({
    required this.lmsClass,
    required this.initialSession,
    required this.sessionStream,
    required this.onCloseSession,
  });

  final LmsClass lmsClass;
  final AttendanceSession initialSession;
  final Stream<AttendanceSession?> sessionStream;
  final VoidCallback onCloseSession;

  @override
  State<_ProjectorQrDialog> createState() => _ProjectorQrDialogState();
}

class _ProjectorQrDialogState extends State<_ProjectorQrDialog> {
  Timer? _ticker;
  int _nowMs = DateTime.now().millisecondsSinceEpoch;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() => _nowMs = DateTime.now().millisecondsSinceEpoch);
      }
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog.fullscreen(
      backgroundColor: AppColors.darkBackground,
      child: SafeArea(
        child: StreamBuilder<AttendanceSession?>(
          stream: widget.sessionStream,
          initialData: widget.initialSession,
          builder: (context, snap) {
            final session = snap.data;
            if (session == null || !session.isOpen) {
              return Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'Sesi Presensi Ditutup',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 14),
                    ElevatedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('Tutup Proyektor'),
                    ),
                  ],
                ),
              );
            }

            final remainingMs = session.expiresAtMs > 0
                ? (session.expiresAtMs - _nowMs).clamp(0, 1 << 31)
                : 0;
            final expired = session.expiresAtMs > 0 && remainingMs <= 0;

            return Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Align(
                    alignment: Alignment.topRight,
                    child: IconButton(
                      tooltip: 'Tutup Proyektor',
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close, color: Colors.white),
                    ),
                  ),
                  const Spacer(),
                  Text(
                    '${widget.lmsClass.code} • PROYEKTOR QR PRESENSI',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.5,
                      color: AppColors.amber,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${widget.lmsClass.displayTitle} — Pertemuan ${session.meetingNo}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 22),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: AppColors.amber, width: 4),
                    ),
                    child: QrImageView(
                      data: AttendanceQrUtils.buildPayload(session.sessionCode),
                      version: QrVersions.auto,
                      size: 250,
                      backgroundColor: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.darkBorder),
                    ),
                    child: SelectableText(
                      session.sessionCode,
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 2.5,
                        color: AppColors.amber,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    expired
                        ? 'Sisa Waktu: Kedaluwarsa'
                        : 'Sisa Waktu Sesi: ${_AttendanceTabState._formatCountdownMs(remainingMs)}',
                    style: TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: expired ? AppColors.rose : AppColors.emerald,
                    ),
                  ),
                  const Spacer(),
                  Wrap(
                    spacing: 12,
                    runSpacing: 10,
                    alignment: WrapAlignment.center,
                    children: [
                      OutlinedButton(
                        onPressed: () => Navigator.of(context).pop(),
                        child: const Text('Keluar Proyektor'),
                      ),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.rose,
                          foregroundColor: Colors.white,
                        ),
                        onPressed: widget.onCloseSession,
                        child: const Text('Tutup Sesi Presensi'),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
