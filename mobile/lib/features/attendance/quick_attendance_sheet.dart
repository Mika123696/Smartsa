import 'package:flutter/material.dart';

import '../../core/models/attendance_models.dart';
import '../../core/models/lms_class.dart';
import '../../core/models/user_profile.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import 'student_attendance_check_in_card.dart';

/// Modal bottom sheet / dialog akses cepat presensi QR langsung dari Dashboard mahasiswa.
Future<void> showQuickAttendanceSheet({
  required BuildContext context,
  required UserProfile profile,
  required List<LmsClass> classes,
  required FirestoreService firestoreService,
  VoidCallback? onSuccess,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _QuickAttendanceSheetBody(
      profile: profile,
      classes: classes,
      firestoreService: firestoreService,
      onSuccess: onSuccess,
    ),
  );
}

class _QuickAttendanceSheetBody extends StatefulWidget {
  const _QuickAttendanceSheetBody({
    required this.profile,
    required this.classes,
    required this.firestoreService,
    this.onSuccess,
  });

  final UserProfile profile;
  final List<LmsClass> classes;
  final FirestoreService firestoreService;
  final VoidCallback? onSuccess;

  @override
  State<_QuickAttendanceSheetBody> createState() =>
      _QuickAttendanceSheetBodyState();
}

class _QuickAttendanceSheetBodyState extends State<_QuickAttendanceSheetBody> {
  late String _selectedClassId;

  LmsClass? get _selectedClass => widget.classes
      .where((c) => c.id == _selectedClassId)
      .firstOrNull;

  @override
  void initState() {
    super.initState();
    _selectedClassId =
        widget.classes.isNotEmpty ? widget.classes.first.id : '';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final selectedClass = _selectedClass;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + bottomInset),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.qr_code_scanner, color: AppColors.amber),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Presensi Cepat Mata Kuliah',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Tutup',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 10),
            if (widget.classes.isEmpty || selectedClass == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Text(
                  'Anda belum tergabung dalam kelas aktif. Gabung kelas terlebih dahulu menggunakan kode kelas.',
                ),
              )
            else ...[
              DropdownButtonFormField<String>(
                initialValue: selectedClass.id,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Pilih Mata Kuliah',
                ),
                items: widget.classes
                    .map(
                      (c) => DropdownMenuItem<String>(
                        value: c.id,
                        child: Text(
                          c.code.isNotEmpty
                              ? '${c.code} — ${c.displayTitle}'
                              : c.displayTitle,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (val) {
                  if (val != null) {
                    setState(() => _selectedClassId = val);
                  }
                },
              ),
              const SizedBox(height: 12),
              StreamBuilder<AttendanceSession?>(
                stream: widget.firestoreService.watchClassAttendanceSession(
                  selectedClass.id,
                ),
                builder: (context, snap) {
                  return StudentAttendanceCheckInCard(
                    lmsClass: selectedClass,
                    profile: widget.profile,
                    firestoreService: widget.firestoreService,
                    activeSession: snap.data,
                    onCheckInSuccess: (res) {
                      widget.onSuccess?.call();
                      if (!mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(res.message),
                          backgroundColor: AppColors.emerald,
                        ),
                      );
                    },
                  );
                },
              ),
            ],
          ],
        ),
      ),
    );
  }
}
