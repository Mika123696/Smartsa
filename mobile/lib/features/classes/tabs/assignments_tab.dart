import 'package:flutter/material.dart';

import '../../../core/models/assignment_models.dart';
import '../../../core/models/lms_class.dart';
import '../../../core/models/user_profile.dart';
import '../../../core/services/cloudinary_upload_service.dart';
import '../../../core/services/firestore_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/picked_file_helper.dart';
import '../../../core/utils/url_utils.dart';

/// Tab Tugas & Penilaian pada [ClassDetailScreen].
class AssignmentsTab extends StatefulWidget {
  const AssignmentsTab({
    super.key,
    required this.lmsClass,
    required this.profile,
    required this.firestoreService,
    required this.cloudinaryUploadService,
  });

  final LmsClass lmsClass;
  final UserProfile profile;
  final FirestoreService firestoreService;
  final CloudinaryUploadService cloudinaryUploadService;

  @override
  State<AssignmentsTab> createState() => _AssignmentsTabState();
}

class _AssignmentsTabState extends State<AssignmentsTab> {
  List<AssignmentItem> _assignments = const <AssignmentItem>[];
  Map<String, SubmissionItem> _mySubmissions = const <String, SubmissionItem>{};
  List<SubmissionItem> _classSubmissions = const <SubmissionItem>[];
  bool _loading = true;
  String? _errorMsg;
  bool _showGradingView = false;

  bool get _isEducatorOrAdmin =>
      widget.profile.isLecturer || widget.profile.isAdmin;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _errorMsg = null;
    });

    try {
      final assignments = await widget.firestoreService
          .fetchClassAssignments(widget.lmsClass.id);

      if (_isEducatorOrAdmin) {
        final subs = await widget.firestoreService
            .fetchClassSubmissionsForGrading(widget.lmsClass.id);
        if (!mounted) return;
        setState(() {
          _assignments = assignments;
          _classSubmissions = subs;
        });
      } else {
        final mySubs = await widget.firestoreService.fetchStudentClassSubmissions(
          classId: widget.lmsClass.id,
          uid: widget.profile.uid,
        );
        if (!mounted) return;
        setState(() {
          _assignments = assignments;
          _mySubmissions = mySubs;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMsg = 'Gagal memuat data tugas: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openSafeUrl(String url) async {
    final ok = await UrlUtils.launchSafeExternalUrl(url);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Tautan tidak valid atau gagal dibuka.'),
          backgroundColor: AppColors.rose,
        ),
      );
    }
  }

  Future<void> _openCreateAssignmentDialog() async {
    final created = await showDialog<AssignmentItem>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => _CreateAssignmentDialog(
        lmsClass: widget.lmsClass,
        profile: widget.profile,
        firestoreService: widget.firestoreService,
        cloudinaryUploadService: widget.cloudinaryUploadService,
      ),
    );
    if (created == null || !mounted) return;
    await _loadData();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Tugas "${created.title}" berhasil dibuat.'),
        backgroundColor: AppColors.emerald,
      ),
    );
  }

  Future<void> _openStudentSubmitDialog(
    AssignmentItem task,
    SubmissionItem? existing,
  ) async {
    final saved = await showDialog<SubmissionItem>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => _StudentSubmitDialog(
        lmsClass: widget.lmsClass,
        assignment: task,
        existingSubmission: existing,
        profile: widget.profile,
        firestoreService: widget.firestoreService,
        cloudinaryUploadService: widget.cloudinaryUploadService,
      ),
    );
    if (saved == null || !mounted) return;
    await _loadData();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Pengumpulan tugas berhasil disimpan ke Firestore.'),
        backgroundColor: AppColors.emerald,
      ),
    );
  }

  Future<void> _openGradeDialog(SubmissionItem sub) async {
    final gradeCtrl = TextEditingController(
      text: sub.effectiveGrade?.toString() ?? '',
    );
    final feedbackCtrl = TextEditingController(text: sub.feedback);
    String? errText;
    bool busy = false;

    final saved = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text('Nilai Tugas — ${sub.studentName}'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  sub.assignmentTitle,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                if (sub.groupName.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Kelompok: ${sub.groupName} (${sub.groupMembers.join(', ')})',
                    style: Theme.of(ctx).textTheme.bodySmall,
                  ),
                ],
                const SizedBox(height: 12),
                TextField(
                  controller: gradeCtrl,
                  enabled: !busy,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Nilai (0 - 100)',
                    hintText: '85',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: feedbackCtrl,
                  enabled: !busy,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Catatan / Umpan Balik (Opsional)',
                  ),
                ),
                if (errText != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    errText!,
                    style: const TextStyle(color: AppColors.rose, fontSize: 12),
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: busy ? null : () => Navigator.of(ctx).pop(false),
              child: const Text('Batal'),
            ),
            ElevatedButton(
              onPressed: busy
                  ? null
                  : () async {
                      final parsed = num.tryParse(gradeCtrl.text.trim());
                      if (parsed == null || parsed < 0 || parsed > 100) {
                        setDialogState(() {
                          errText = 'Nilai harus angka antara 0 hingga 100.';
                        });
                        return;
                      }
                      setDialogState(() {
                        busy = true;
                        errText = null;
                      });
                      try {
                        await widget.firestoreService.gradeSubmission(
                          submissionId: sub.submissionId,
                          gradedByUid: widget.profile.uid,
                          grade: parsed,
                          feedback: feedbackCtrl.text.trim(),
                        );
                        if (ctx.mounted) Navigator.of(ctx).pop(true);
                      } catch (e) {
                        if (ctx.mounted) {
                          setDialogState(() {
                            busy = false;
                            errText = e.toString();
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
                        color: Colors.black,
                      ),
                    )
                  : const Text('Simpan Nilai'),
            ),
          ],
        ),
      ),
    );

    gradeCtrl.dispose();
    feedbackCtrl.dispose();

    if (saved == true && mounted) {
      await _loadData();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Nilai tugas berhasil disimpan.'),
          backgroundColor: AppColors.emerald,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_isEducatorOrAdmin) ...[
            Row(
              children: [
                Expanded(
                  child: SegmentedButton<bool>(
                    segments: [
                      ButtonSegment(
                        value: false,
                        label: Text('Tugas (${_assignments.length})'),
                      ),
                      ButtonSegment(
                        value: true,
                        label: Text('Penilaian (${_classSubmissions.length})'),
                      ),
                    ],
                    selected: <bool>{_showGradingView},
                    onSelectionChanged: (sel) =>
                        setState(() => _showGradingView = sel.first),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _openCreateAssignmentDialog,
                  tooltip: 'Buat Tugas Baru',
                  icon: const Icon(Icons.add),
                ),
              ],
            ),
            const SizedBox(height: 14),
          ],

          if (_errorMsg != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  _errorMsg!,
                  style: const TextStyle(color: AppColors.rose),
                ),
              ),
            )
          else if (_loading && _assignments.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_isEducatorOrAdmin && _showGradingView)
            _buildGradingList(theme)
          else
            _buildAssignmentList(theme),
        ],
      ),
    );
  }

  Widget _buildAssignmentList(ThemeData theme) {
    if (_assignments.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Icon(
                Icons.assignment_outlined,
                size: 40,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
              ),
              const SizedBox(height: 10),
              Text(
                'Belum ada tugas pada kelas ini',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      children: [
        for (final task in _assignments) ...[
          Builder(
            builder: (context) {
              final sub = _mySubmissions[task.id];
              final isLocked = sub?.isLocked ?? false;
              final gradeVal = sub?.effectiveGrade;

              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: [
                          _Badge(
                            label: task.isGroupTask ? 'KELOMPOK' : 'INDIVIDU',
                            color: task.isGroupTask
                                ? AppColors.cyanDark
                                : AppColors.amber,
                          ),
                          _Badge(
                            label: 'P${task.meetingNo}',
                            color: AppColors.amber,
                          ),
                          if (sub != null)
                            _Badge(
                              label: isLocked
                                  ? 'DINILAI: $gradeVal/100'
                                  : 'TERKUMPUL',
                              color: AppColors.emerald,
                            ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        task.title,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Batas waktu: ${task.displayDeadline}',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppColors.amber,
                        ),
                      ),
                      if (task.note.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(task.note, style: theme.textTheme.bodySmall),
                      ],
                      if (task.attachmentUrl.isNotEmpty &&
                          UrlUtils.isSafeHttpUrl(task.attachmentUrl)) ...[
                        const SizedBox(height: 10),
                        OutlinedButton.icon(
                          onPressed: () => _openSafeUrl(task.attachmentUrl),
                          icon: const Icon(Icons.attach_file, size: 16),
                          label: Text(
                            task.attachmentName.isNotEmpty
                                ? task.attachmentName
                                : 'Buka Lampiran Soal',
                          ),
                        ),
                      ],
                      if (!_isEducatorOrAdmin) ...[
                        if (sub != null && sub.groupName.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Kelompok: ${sub.groupName} (${sub.groupMembers.join(', ')})',
                            style: theme.textTheme.bodySmall,
                          ),
                        ],
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: () => _openStudentSubmitDialog(task, sub),
                            icon: Icon(
                              isLocked
                                  ? Icons.lock_outline
                                  : sub != null
                                  ? Icons.edit_outlined
                                  : Icons.upload_file,
                              size: 18,
                            ),
                            label: Text(
                              isLocked
                                  ? 'Lihat Nilai (Terkunci)'
                                  : sub != null
                                  ? 'Perbarui Pengumpulan'
                                  : 'Kumpulkan Tugas',
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ],
    );
  }

  Widget _buildGradingList(ThemeData theme) {
    if (_classSubmissions.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Belum ada pengumpulan tugas mahasiswa pada kelas ini.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall,
          ),
        ),
      );
    }

    return Column(
      children: [
        for (final sub in _classSubmissions)
          Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          sub.studentName,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      _Badge(
                        label: sub.isLocked
                            ? 'NILAI: ${sub.effectiveGrade}'
                            : 'BELUM DINILAI',
                        color: sub.isLocked
                            ? AppColors.emerald
                            : AppColors.amber,
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    sub.assignmentTitle,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (sub.groupName.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Kelompok: ${sub.groupName} (${sub.groupMembers.join(', ')})',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                  if (sub.notes.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text('Catatan: ${sub.notes}', style: theme.textTheme.bodySmall),
                  ],
                  const SizedBox(height: 6),
                  Text(
                    'Dikumpulkan: ${sub.submittedAtLabel}',
                    style: theme.textTheme.labelSmall,
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      if (UrlUtils.isSafeHttpUrl(sub.effectiveUrl))
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => _openSafeUrl(sub.effectiveUrl),
                            icon: const Icon(Icons.open_in_new, size: 16),
                            label: Text(
                              sub.fileName.isNotEmpty
                                  ? sub.fileName
                                  : 'Buka Berkas',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      if (UrlUtils.isSafeHttpUrl(sub.effectiveUrl))
                        const SizedBox(width: 10),
                      ElevatedButton.icon(
                        onPressed: () => _openGradeDialog(sub),
                        icon: const Icon(Icons.grade_outlined, size: 16),
                        label: Text(sub.isLocked ? 'Ubah Nilai' : 'Beri Nilai'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(5),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontFamily: 'monospace',
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: color,
        ),
      ),
    );
  }
}

class _CreateAssignmentDialog extends StatefulWidget {
  const _CreateAssignmentDialog({
    required this.lmsClass,
    required this.profile,
    required this.firestoreService,
    required this.cloudinaryUploadService,
  });

  final LmsClass lmsClass;
  final UserProfile profile;
  final FirestoreService firestoreService;
  final CloudinaryUploadService cloudinaryUploadService;

  @override
  State<_CreateAssignmentDialog> createState() =>
      _CreateAssignmentDialogState();
}

class _CreateAssignmentDialogState extends State<_CreateAssignmentDialog> {
  final _titleCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  final _deadlineCtrl = TextEditingController(text: '2026-12-15T23:59:00+07:00');
  int _meetingNo = 1;
  String _taskType = 'individu';
  PickedUploadFile? _pickedAttachment;
  bool _submitting = false;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    if (widget.lmsClass.meetings.isNotEmpty) {
      _meetingNo = widget.lmsClass.meetings.first.order;
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _noteCtrl.dispose();
    _deadlineCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickAttachment() async {
    try {
      final file = await pickAndValidateUploadFile(
        category: 'document',
        allowedExtensions: const <String>[
          'pdf',
          'pptx',
          'ppt',
          'docx',
          'doc',
          'zip',
          'jpg',
          'jpeg',
          'png',
        ],
      );
      if (file != null && mounted) {
        setState(() {
          _pickedAttachment = file;
          _errorText = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _errorText = e.toString());
      }
    }
  }

  Future<void> _submit() async {
    if (_titleCtrl.text.trim().isEmpty) {
      setState(() => _errorText = 'Judul tugas wajib diisi.');
      return;
    }

    setState(() {
      _submitting = true;
      _errorText = null;
    });

    try {
      var attUrl = '';
      var attName = '';
      var attSize = '';

      if (_pickedAttachment != null) {
        final uploadRes = await widget.cloudinaryUploadService.uploadFile(
          category: 'document',
          fileName: _pickedAttachment!.name,
          fileSize: _pickedAttachment!.fileSize,
          bytes: _pickedAttachment!.bytes,
          filePath: _pickedAttachment!.filePath,
        );
        attUrl = uploadRes.url;
        attName = uploadRes.fileName;
        attSize = uploadRes.fileSizeLabel;
      }

      final created = await widget.firestoreService.createAssignment(
        classId: widget.lmsClass.id,
        createdByUid: widget.profile.uid,
        title: _titleCtrl.text,
        subject: widget.lmsClass.displayTitle,
        subjectCode: widget.lmsClass.code,
        meetingNo: _meetingNo,
        taskType: _taskType,
        deadline: _deadlineCtrl.text,
        note: _noteCtrl.text,
        attachmentUrl: attUrl,
        attachmentName: attName,
        attachmentSize: attSize,
      );

      if (!mounted) return;
      Navigator.of(context).pop(created);
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorText = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final meetingNumbers = widget.lmsClass.meetings.isNotEmpty
        ? widget.lmsClass.meetings.map((m) => m.order).toList()
        : List<int>.generate(16, (i) => i + 1);
    if (!meetingNumbers.contains(_meetingNo)) {
      _meetingNo = meetingNumbers.first;
    }

    return AlertDialog(
      title: const Text('Buat Tugas Baru'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _titleCtrl,
              enabled: !_submitting,
              decoration: const InputDecoration(labelText: 'Judul Tugas'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<int>(
              initialValue: _meetingNo,
              decoration: const InputDecoration(labelText: 'Pertemuan'),
              items: meetingNumbers
                  .map(
                    (n) => DropdownMenuItem<int>(
                      value: n,
                      child: Text('Pertemuan $n'),
                    ),
                  )
                  .toList(),
              onChanged: _submitting
                  ? null
                  : (v) {
                      if (v != null) setState(() => _meetingNo = v);
                    },
            ),
            const SizedBox(height: 12),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'individu', label: Text('Individu')),
                ButtonSegment(value: 'kelompok', label: Text('Kelompok')),
              ],
              selected: <String>{_taskType},
              onSelectionChanged: _submitting
                  ? null
                  : (sel) => setState(() => _taskType = sel.first),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _deadlineCtrl,
              enabled: !_submitting,
              decoration: const InputDecoration(labelText: 'Batas Waktu (ISO)'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _noteCtrl,
              enabled: !_submitting,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Instruksi Tugas'),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _submitting ? null : _pickAttachment,
              icon: const Icon(Icons.attach_file),
              label: Text(
                _pickedAttachment == null
                    ? 'Lampiran Soal Opsional'
                    : _pickedAttachment!.name,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (_errorText != null) ...[
              const SizedBox(height: 10),
              Text(
                _errorText!,
                style: const TextStyle(color: AppColors.rose, fontSize: 12),
              ),
            ],
          ],
        ),
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
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.black,
                  ),
                )
              : const Text('Simpan Tugas'),
        ),
      ],
    );
  }
}

class _StudentSubmitDialog extends StatefulWidget {
  const _StudentSubmitDialog({
    required this.lmsClass,
    required this.assignment,
    required this.existingSubmission,
    required this.profile,
    required this.firestoreService,
    required this.cloudinaryUploadService,
  });

  final LmsClass lmsClass;
  final AssignmentItem assignment;
  final SubmissionItem? existingSubmission;
  final UserProfile profile;
  final FirestoreService firestoreService;
  final CloudinaryUploadService cloudinaryUploadService;

  @override
  State<_StudentSubmitDialog> createState() => _StudentSubmitDialogState();
}

class _StudentSubmitDialogState extends State<_StudentSubmitDialog> {
  late final TextEditingController _urlCtrl;
  late final TextEditingController _notesCtrl;
  late final TextEditingController _groupNameCtrl;
  late final TextEditingController _groupMembersCtrl;

  PickedUploadFile? _pickedFile;
  bool _submitting = false;
  String? _errorText;

  bool get _isLocked => widget.existingSubmission?.isLocked ?? false;

  @override
  void initState() {
    super.initState();
    final ex = widget.existingSubmission;
    _urlCtrl = TextEditingController(
      text: ex?.externalUrl.isNotEmpty == true
          ? ex!.externalUrl
          : (ex?.fileUrl ?? ''),
    );
    _notesCtrl = TextEditingController(text: ex?.notes ?? '');
    _groupNameCtrl = TextEditingController(text: ex?.groupName ?? '');
    _groupMembersCtrl = TextEditingController(
      text: ex?.groupMembers.join(', ') ?? '',
    );
  }

  @override
  void dispose() {
    _urlCtrl.dispose();
    _notesCtrl.dispose();
    _groupNameCtrl.dispose();
    _groupMembersCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickSubmissionFile() async {
    try {
      final file = await pickAndValidateUploadFile(
        category: 'submission',
        allowedExtensions: const <String>[
          'pdf',
          'docx',
          'zip',
          'jpg',
          'jpeg',
          'png',
        ],
      );
      if (file == null || !mounted) return;
      setState(() {
        _pickedFile = file;
        _errorText = null;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _errorText = e.toString());
      }
    }
  }

  Future<void> _submit() async {
    if (_isLocked) return;

    final groupMembersList = _groupMembersCtrl.text
        .split(RegExp(r'[\r\n,;]+'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList(growable: false);

    if (widget.assignment.isGroupTask) {
      if (_groupNameCtrl.text.trim().isEmpty || groupMembersList.isEmpty) {
        setState(() {
          _errorText =
              'Nama Kelompok dan Daftar Anggota wajib diisi untuk tugas kelompok.';
        });
        return;
      }
    }

    final rawUrl = _urlCtrl.text.trim();
    if (_pickedFile == null && rawUrl.isEmpty) {
      setState(() {
        _errorText = 'Pilih berkas atau isi URL https:// pengumpulan tugas.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _errorText = null;
    });

    try {
      var fileUrl = '';
      var fileName = '';
      var fileSize = '';
      var externalUrl = rawUrl;
      var storageType = 'external_url';

      if (_pickedFile != null) {
        final uploadRes = await widget.cloudinaryUploadService.uploadFile(
          category: 'submission',
          fileName: _pickedFile!.name,
          fileSize: _pickedFile!.fileSize,
          bytes: _pickedFile!.bytes,
          filePath: _pickedFile!.filePath,
          classId: widget.lmsClass.id,
          assignmentId: widget.assignment.id,
        );
        fileUrl = uploadRes.url;
        fileName = uploadRes.fileName;
        fileSize = uploadRes.fileSizeLabel;
        externalUrl = '';
        storageType = 'cloudinary';
      } else {
        if (UrlUtils.sanitizeSafeUrl(rawUrl, requireHttps: true) == null) {
          throw const FormatException(
            'URL eksternal wajib diawali dengan https:// yang valid.',
          );
        }
      }

      final saved = await widget.firestoreService.submitAssignment(
        assignmentId: widget.assignment.id,
        classId: widget.lmsClass.id,
        meetingNo: widget.assignment.meetingNo,
        assignmentTitle: widget.assignment.title,
        className: widget.lmsClass.displayTitle,
        uid: widget.profile.uid,
        studentName: widget.profile.effectiveName,
        taskType: widget.assignment.taskType,
        groupName: _groupNameCtrl.text,
        groupMembers: groupMembersList,
        fileName: fileName,
        fileSize: fileSize,
        fileUrl: fileUrl,
        externalUrl: externalUrl,
        storageType: storageType,
        notes: _notesCtrl.text,
      );

      if (!mounted) return;
      Navigator.of(context).pop(saved);
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorText = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ex = widget.existingSubmission;

    return AlertDialog(
      title: Text(
        _isLocked ? 'Detail Tugas (Terkunci)' : 'Kumpulkan Tugas',
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.assignment.title,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            if (_isLocked && ex != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.emerald.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: AppColors.emerald.withValues(alpha: 0.45),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'NILAI: ${ex.effectiveGrade} / 100 (MODE BACA-SAJA)',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: AppColors.emerald,
                      ),
                    ),
                    if (ex.feedback.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text('Catatan Dosen: ${ex.feedback}'),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (widget.assignment.isGroupTask) ...[
              TextField(
                controller: _groupNameCtrl,
                enabled: !_isLocked && !_submitting,
                decoration: const InputDecoration(
                  labelText: 'Nama Kelompok (Wajib)',
                  hintText: 'Contoh: Kelompok 01',
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _groupMembersCtrl,
                enabled: !_isLocked && !_submitting,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Daftar Anggota Kelompok (Nama / NIM)',
                  hintText: 'Andi (2301...), Budi (2302...)',
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (!_isLocked) ...[
              OutlinedButton.icon(
                onPressed: _submitting ? null : _pickSubmissionFile,
                icon: const Icon(Icons.upload_file),
                label: Text(
                  _pickedFile == null
                      ? 'Pilih Berkas (PDF/DOCX/ZIP/JPG/PNG, maks 15MB)'
                      : '${_pickedFile!.name} (${_pickedFile!.sizeLabel})',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(height: 10),
            ],
            TextField(
              controller: _urlCtrl,
              enabled: !_isLocked && !_submitting,
              decoration: const InputDecoration(
                labelText: 'Atau Tautan URL HTTPS',
                hintText: 'https://drive.google.com/...',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _notesCtrl,
              enabled: !_isLocked && !_submitting,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Catatan Tambahan (Opsional)',
              ),
            ),
            if (_errorText != null) ...[
              const SizedBox(height: 10),
              Text(
                _errorText!,
                style: const TextStyle(color: AppColors.rose, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(),
          child: Text(_isLocked ? 'Tutup' : 'Batal'),
        ),
        if (!_isLocked)
          ElevatedButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.black,
                    ),
                  )
                : const Text('Kirim Pengumpulan'),
          ),
      ],
    );
  }
}
