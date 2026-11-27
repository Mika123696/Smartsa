import 'package:flutter/material.dart';

import '../../../core/models/exam_models.dart';
import '../../../core/models/lms_class.dart';
import '../../../core/models/user_profile.dart';
import '../../../core/services/api_client.dart';
import '../../../core/services/firestore_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/exam_draft_store.dart';
import 'exam_editor_screen.dart';
import 'exam_runner_screen.dart';

/// Tab Evaluasi Pretest & Posttest (`POST /api/grade`) pada [ClassDetailScreen].
///
/// - **Mahasiswa:** melihat status Pretest & Posttest per pertemuan (`Belum Dikerjakan`,
///   `Sedang Berlangsung`, `Selesai`), skor & `pointsPerQuestion`, Gain pribadi,
///   serta mengerjakan ujian via server `/api/grade` tanpa pernah menyentuh `exam_keys`.
/// - **Dosen/Admin:** membuka Editor 5 opsi & Import Aiken, mengarsipkan/menghapus ujian,
///   melihat kunci referensi server, serta Rekap Nilai & Gain (`Posttest - Pretest`).
class ExamTab extends StatefulWidget {
  const ExamTab({
    super.key,
    required this.lmsClass,
    required this.profile,
    required this.apiClient,
    required this.firestoreService,
  });

  final LmsClass lmsClass;
  final UserProfile profile;
  final ApiClient apiClient;
  final FirestoreService firestoreService;

  @override
  State<ExamTab> createState() => _ExamTabState();
}

class _ExamTabState extends State<ExamTab> {
  int _selectedMeetingNo = 1;
  String _educatorExamType = 'pretest';

  MeetingExam? _pretestExam;
  MeetingExam? _posttestExam;
  List<ExamAttempt> _userAttempts = const <ExamAttempt>[];

  // State khusus Dosen/Admin
  Map<String, int> _instructorKeys = const <String, int>{};
  List<ExamAttempt> _classAttempts = const <ExamAttempt>[];
  List<ClassMembership> _classMembers = const <ClassMembership>[];

  bool _loading = true;
  bool _actionBusy = false;
  String? _errorText;
  String? _feedbackText;
  bool _feedbackIsError = false;

  bool get _isEducatorOrAdmin =>
      widget.profile.isLecturer || widget.profile.isAdmin;

  List<int> get _meetingNumbers => widget.lmsClass.meetings.isNotEmpty
      ? widget.lmsClass.meetings.map((m) => m.order).toList(growable: false)
      : List<int>.generate(16, (idx) => idx + 1);

  @override
  void initState() {
    super.initState();
    _selectedMeetingNo = _meetingNumbers.first;
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _errorText = null;
    });

    try {
      final pretestFuture = widget.firestoreService.fetchMeetingExam(
        classId: widget.lmsClass.id,
        meetingNo: _selectedMeetingNo,
        examType: 'pretest',
      );
      final posttestFuture = widget.firestoreService.fetchMeetingExam(
        classId: widget.lmsClass.id,
        meetingNo: _selectedMeetingNo,
        examType: 'posttest',
      );

      if (_isEducatorOrAdmin) {
        final keysFuture = widget.apiClient.postInstructorExamKeys(
          classId: widget.lmsClass.id,
          meetingNo: _selectedMeetingNo,
          examType: _educatorExamType,
        );
        final attemptsFuture = widget.firestoreService.fetchClassExamAttempts(
          widget.lmsClass.id,
        );
        final membersFuture = widget.firestoreService.fetchClassMembers(
          widget.lmsClass.id,
        );

        final results = await Future.wait<dynamic>(<Future<dynamic>>[
          pretestFuture,
          posttestFuture,
          keysFuture,
          attemptsFuture,
          membersFuture,
        ]);

        if (!mounted) return;
        final rawKeys =
            (results[2] as Map<String, dynamic>)['answerKey'] as Map? ??
            const <String, dynamic>{};
        final parsedKeys = <String, int>{};
        for (final entry in rawKeys.entries) {
          final v = entry.value is num
              ? (entry.value as num).toInt()
              : int.tryParse(entry.value?.toString() ?? '');
          if (v != null) parsedKeys[entry.key.toString()] = v;
        }

        setState(() {
          _pretestExam = results[0] as MeetingExam?;
          _posttestExam = results[1] as MeetingExam?;
          _instructorKeys = parsedKeys;
          _classAttempts = results[3] as List<ExamAttempt>;
          _classMembers = results[4] as List<ClassMembership>;
        });
      } else {
        final attemptsFuture =
            widget.firestoreService.fetchUserClassExamAttempts(
              classId: widget.lmsClass.id,
              uid: widget.profile.uid,
            );
        final results = await Future.wait<dynamic>(<Future<dynamic>>[
          pretestFuture,
          posttestFuture,
          attemptsFuture,
        ]);
        if (!mounted) return;
        setState(() {
          _pretestExam = results[0] as MeetingExam?;
          _posttestExam = results[1] as MeetingExam?;
          _userAttempts = results[2] as List<ExamAttempt>;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorText = e.toString());
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  ExamAttempt? _findAttemptFor(int meetingNo, String examType) {
    return _userAttempts
        .where((a) => a.meetingNo == meetingNo && a.examType == examType)
        .firstOrNull;
  }

  Future<void> _startOrResumeStudentExam(MeetingExam exam) async {
    if (_actionBusy) return;
    setState(() {
      _actionBusy = true;
      _feedbackText = null;
      _feedbackIsError = false;
    });

    try {
      final startData = await widget.apiClient.postStartExam(
        classId: widget.lmsClass.id,
        meetingNo: exam.meetingNo,
        examType: exam.examType,
      );

      final parsedExp = ExamAttempt.parseTimestampMs(
        startData['examExpiresAt'] ?? startData['expiresAt'],
      );
      final expiresAtMs =
          parsedExp ??
          DateTime.now().millisecondsSinceEpoch +
              (exam.durationMinutes * 60 * 1000);

      final restoredDraft = await ExamDraftStore.readDraftAnswers(
        classId: widget.lmsClass.id,
        meetingNo: exam.meetingNo,
        examType: exam.examType,
        uid: widget.profile.uid,
      );

      if (!mounted) return;
      final submittedAttempt = await Navigator.of(context).push<ExamAttempt>(
        MaterialPageRoute<ExamAttempt>(
          builder: (_) => ExamRunnerScreen(
            lmsClass: widget.lmsClass,
            exam: exam,
            profile: widget.profile,
            apiClient: widget.apiClient,
            examExpiresAtMs: expiresAtMs,
            initialAnswers: restoredDraft,
          ),
        ),
      );

      await _loadData();
      if (!mounted || submittedAttempt == null) return;

      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Hasil Evaluasi Tersimpan'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Skor Akhir: ${submittedAttempt.score ?? 0} / 100',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  color: AppColors.amber,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Benar: ${submittedAttempt.correctCount ?? 0} dari ${submittedAttempt.totalQuestions} soal',
              ),
              Text(
                'Bobot: ${submittedAttempt.pointsPerQuestion} poin/soal',
              ),
              const SizedBox(height: 6),
              Text(
                submittedAttempt.passed
                    ? 'Status: KOMPETEN (LULUS ≥ 75)'
                    : 'Status: PERLU PENDALAMAN MODUL',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  color: submittedAttempt.passed
                      ? AppColors.emerald
                      : AppColors.amberDark,
                ),
              ),
            ],
          ),
          actions: [
            ElevatedButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Tutup'),
            ),
          ],
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _feedbackText = e.message;
        _feedbackIsError = true;
      });
      if (e.code == 'EXAM_ALREADY_SUBMITTED') {
        await _loadData();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _feedbackText = 'Gagal memulai sesi evaluasi: $e';
        _feedbackIsError = true;
      });
    } finally {
      if (mounted) {
        setState(() => _actionBusy = false);
      }
    }
  }

  Future<void> _openEducatorEditor() async {
    final targetExam =
        _educatorExamType == 'posttest' ? _posttestExam : _pretestExam;
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => InstructorExamEditorScreen(
          lmsClass: widget.lmsClass,
          meetingNo: _selectedMeetingNo,
          examType: _educatorExamType,
          initialExam: targetExam,
          initialAnswerKey: _instructorKeys,
          apiClient: widget.apiClient,
        ),
      ),
    );
    if (saved == true && mounted) {
      setState(() {
        _feedbackText =
            'Soal & kunci ${_educatorExamType.toUpperCase()} Pertemuan $_selectedMeetingNo berhasil disimpan ke server.';
        _feedbackIsError = false;
      });
      await _loadData();
    }
  }

  Future<void> _archiveExamWithConfirm() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          'Arsipkan ${_educatorExamType.toUpperCase()} P$_selectedMeetingNo?',
        ),
        content: const Text(
          'Evaluasi berstatus archived tidak dapat dikerjakan mahasiswa lagi, namun rekap nilai sebelumnya tetap tersimpan.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Arsipkan'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _actionBusy = true);
    try {
      await widget.apiClient.postArchiveExam(
        classId: widget.lmsClass.id,
        meetingNo: _selectedMeetingNo,
        examType: _educatorExamType,
      );
      if (!mounted) return;
      setState(() {
        _feedbackText =
            'Evaluasi ${_educatorExamType.toUpperCase()} Pertemuan $_selectedMeetingNo berhasil diarsipkan.';
        _feedbackIsError = false;
      });
      await _loadData();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _feedbackText = 'Gagal mengarsipkan evaluasi: $e';
        _feedbackIsError = true;
      });
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _deleteExamWithConfirm() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          'Hapus ${_educatorExamType.toUpperCase()} P$_selectedMeetingNo?',
        ),
        content: const Text(
          'Soal dan kunci jawaban evaluasi pada pertemuan & tipe ini akan dihapus permanen dari server.',
        ),
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
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _actionBusy = true);
    try {
      await widget.apiClient.postDeleteExam(
        classId: widget.lmsClass.id,
        meetingNo: _selectedMeetingNo,
        examType: _educatorExamType,
      );
      if (!mounted) return;
      setState(() {
        _feedbackText =
            'Evaluasi ${_educatorExamType.toUpperCase()} Pertemuan $_selectedMeetingNo berhasil dihapus.';
        _feedbackIsError = false;
      });
      await _loadData();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _feedbackText = 'Gagal menghapus evaluasi: $e';
        _feedbackIsError = true;
      });
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final numbers = _meetingNumbers;
    if (!numbers.contains(_selectedMeetingNo)) {
      _selectedMeetingNo = numbers.first;
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Pemilih Pertemuan
          DropdownButtonFormField<int>(
            initialValue: _selectedMeetingNo,
            decoration: const InputDecoration(labelText: 'Pilih Pertemuan'),
            items: numbers
                .map(
                  (n) => DropdownMenuItem<int>(
                    value: n,
                    child: Text('Pertemuan ${n.toString().padLeft(2, '0')}'),
                  ),
                )
                .toList(),
            onChanged: _loading
                ? null
                : (v) {
                    if (v != null && v != _selectedMeetingNo) {
                      setState(() => _selectedMeetingNo = v);
                      _loadData();
                    }
                  },
          ),
          const SizedBox(height: 12),

          if (_feedbackText != null) ...[
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: (_feedbackIsError ? AppColors.rose : AppColors.emerald)
                    .withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: (_feedbackIsError
                          ? AppColors.rose
                          : AppColors.emerald)
                      .withValues(alpha: 0.45),
                ),
              ),
              child: Text(
                _feedbackText!,
                style: TextStyle(
                  fontSize: 12,
                  color: _feedbackIsError ? AppColors.rose : AppColors.emerald,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],

          if (_errorText != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  'Gagal memuat data evaluasi: $_errorText',
                  style: const TextStyle(color: AppColors.rose, fontSize: 12),
                ),
              ),
            )
          else if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_isEducatorOrAdmin)
            _buildEducatorView(context)
          else
            _buildStudentView(context),
        ],
      ),
    );
  }

  Widget _buildStudentView(BuildContext context) {
    final theme = Theme.of(context);
    final preAtt = _findAttemptFor(_selectedMeetingNo, 'pretest');
    final postAtt = _findAttemptFor(_selectedMeetingNo, 'posttest');
    final int? gainDelta = (preAtt?.score != null && postAtt?.score != null)
        ? postAtt!.score! - preAtt!.score!
        : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Ringkasan Skor & Gain Mahasiswa
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'PERBANDINGAN PRETEST & POST-TEST (P$_selectedMeetingNo)',
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w800,
                    color: AppColors.amber,
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    _ScoreMiniBox(
                      label: 'PRETEST',
                      value: preAtt?.score != null ? '${preAtt!.score}' : '—',
                      color: AppColors.amber,
                    ),
                    const SizedBox(width: 8),
                    _ScoreMiniBox(
                      label: 'POST-TEST',
                      value: postAtt?.score != null ? '${postAtt!.score}' : '—',
                      color: AppColors.cyanDark,
                    ),
                    const SizedBox(width: 8),
                    _ScoreMiniBox(
                      label: 'GAIN (Δ)',
                      value: gainDelta == null
                          ? '—'
                          : (gainDelta >= 0 ? '+$gainDelta' : '$gainDelta'),
                      color: gainDelta == null
                          ? theme.colorScheme.onSurface.withValues(alpha: 0.45)
                          : (gainDelta >= 0
                              ? AppColors.emerald
                              : AppColors.rose),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        _buildStudentExamCard(
          context,
          examType: 'pretest',
          exam: _pretestExam,
          attempt: preAtt,
        ),
        const SizedBox(height: 12),
        _buildStudentExamCard(
          context,
          examType: 'posttest',
          exam: _posttestExam,
          attempt: postAtt,
        ),
      ],
    );
  }

  Widget _buildStudentExamCard(
    BuildContext context, {
    required String examType,
    required MeetingExam? exam,
    required ExamAttempt? attempt,
  }) {
    final theme = Theme.of(context);
    final labelTitle = examType == 'posttest' ? 'Post-test' : 'Pretest';
    final isSubmitted = attempt?.isSubmitted ?? false;
    final isInProgress = attempt?.isInProgressActive ?? false;

    final String statusLabel;
    final Color statusColor;
    if (isSubmitted) {
      statusLabel = 'Selesai';
      statusColor = AppColors.emerald;
    } else if (isInProgress) {
      statusLabel = 'Sedang Berlangsung';
      statusColor = AppColors.amber;
    } else {
      statusLabel = 'Belum Dikerjakan';
      statusColor = theme.colorScheme.onSurface.withValues(alpha: 0.5);
    }

    final configured = exam != null && exam.isConfigured;
    final canStart = configured && exam.isPublished && !isSubmitted;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  labelTitle.toUpperCase(),
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w900,
                    color: examType == 'posttest'
                        ? AppColors.cyanDark
                        : AppColors.amber,
                  ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    statusLabel,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: statusColor,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              configured && exam.title.isNotEmpty
                  ? exam.title
                  : '$labelTitle Pertemuan $_selectedMeetingNo',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            if (!configured)
              Text(
                'Soal $labelTitle untuk pertemuan ini belum disiapkan oleh dosen.',
                style: theme.textTheme.bodySmall,
              )
            else ...[
              Text(
                '${exam.questions.length} Soal • Bobot ${exam.effectivePointsPerQuestion} poin/soal • Durasi ${exam.durationMinutes} menit',
                style: theme.textTheme.bodySmall,
              ),
              if (exam.isDraft)
                const Padding(
                  padding: EdgeInsets.only(top: 6),
                  child: Text(
                    'Status: Draft (belum dipublikasikan dosen).',
                    style: TextStyle(color: AppColors.amberDark, fontSize: 12),
                  ),
                ),
              if (exam.isArchived)
                const Padding(
                  padding: EdgeInsets.only(top: 6),
                  child: Text(
                    'Status: Diarsipkan (tidak lagi menerima pengerjaan).',
                    style: TextStyle(color: AppColors.rose, fontSize: 12),
                  ),
                ),
            ],
            if (isSubmitted && attempt?.score != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.emerald.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: AppColors.emerald.withValues(alpha: 0.4),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Skor: ${attempt!.score} / 100',
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 15,
                        color: AppColors.emerald,
                      ),
                    ),
                    Text(
                      'Benar ${attempt.correctCount ?? 0}/${attempt.totalQuestions} (${attempt.pointsPerQuestion} poin/soal)',
                      style: theme.textTheme.labelSmall,
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: canStart && !_actionBusy
                  ? () => _startOrResumeStudentExam(exam)
                  : null,
              icon: Icon(
                isSubmitted
                    ? Icons.lock_outline
                    : isInProgress
                        ? Icons.play_circle_filled
                        : Icons.play_arrow_rounded,
              ),
              label: Text(
                isSubmitted
                    ? '$labelTitle Selesai (Terkunci)'
                    : isInProgress
                        ? 'Lanjutkan $labelTitle'
                        : 'Mulai $labelTitle',
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEducatorView(BuildContext context) {
    final theme = Theme.of(context);
    final activeExam =
        _educatorExamType == 'posttest' ? _posttestExam : _pretestExam;
    final hasQuestions = activeExam != null && activeExam.isConfigured;

    final meetingAttempts = _classAttempts
        .where((a) => a.meetingNo == _selectedMeetingNo)
        .toList(growable: false);
    final scopedAttempts = meetingAttempts
        .where((a) => a.examType == _educatorExamType)
        .toList(growable: false);
    final scored = scopedAttempts
        .where((a) => a.score != null)
        .toList(growable: false);
    final avgScore = scored.isEmpty
        ? 0
        : (scored.fold<int>(0, (sum, a) => sum + a.score!) / scored.length)
            .round();
    final passedCount = scored.where((a) => a.score! >= 75).length;

    final gainRows = ExamStudentGainRow.buildGainRows(
      attempts: _classAttempts,
      members: _classMembers,
      meetingNo: _selectedMeetingNo,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'pretest', label: Text('Pretest')),
            ButtonSegment(value: 'posttest', label: Text('Post-test')),
          ],
          selected: <String>{_educatorExamType},
          onSelectionChanged: (sel) {
            setState(() => _educatorExamType = sel.first);
            _loadData();
          },
        ),
        const SizedBox(height: 12),

        // Status Evaluasi & Aksi Editor/Arsip/Hapus
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (hasQuestions) ...[
                  Text(
                    activeExam.title.isNotEmpty
                        ? activeExam.title
                        : '${_educatorExamType.toUpperCase()} Pertemuan $_selectedMeetingNo',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      _MetaTag(
                        label: activeExam.status.toUpperCase(),
                        color: activeExam.isArchived
                            ? AppColors.rose
                            : activeExam.isDraft
                                ? AppColors.amber
                                : AppColors.emerald,
                      ),
                      _MetaTag(
                        label: '${activeExam.durationMinutes} MENIT',
                        color: AppColors.cyanDark,
                      ),
                      _MetaTag(
                        label:
                            '${activeExam.effectivePointsPerQuestion} POIN/SOAL (${activeExam.questions.length} SOAL)',
                        color: AppColors.amber,
                      ),
                    ],
                  ),
                ] else
                  Text(
                    'Belum ada soal ${_educatorExamType.toUpperCase()} untuk Pertemuan $_selectedMeetingNo.',
                    style: theme.textTheme.bodySmall,
                  ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ElevatedButton.icon(
                      onPressed: _actionBusy ? null : _openEducatorEditor,
                      icon: const Icon(Icons.edit_outlined, size: 17),
                      label: Text(
                        hasQuestions
                            ? 'Edit Soal / Import Aiken'
                            : 'Buat Soal / Import Aiken',
                      ),
                    ),
                    if (hasQuestions && !activeExam.isArchived)
                      OutlinedButton.icon(
                        onPressed:
                            _actionBusy ? null : _archiveExamWithConfirm,
                        icon: const Icon(Icons.archive_outlined, size: 17),
                        label: const Text('Arsipkan'),
                      ),
                    if (hasQuestions)
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.rose,
                          side: const BorderSide(color: AppColors.rose),
                        ),
                        onPressed:
                            _actionBusy ? null : _deleteExamWithConfirm,
                        icon: const Icon(Icons.delete_outline, size: 17),
                        label: const Text('Hapus'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),

        // Ringkasan Statistik
        Row(
          children: [
            _ScoreMiniBox(
              label: 'PESERTA',
              value: '${scopedAttempts.length}',
              color: theme.colorScheme.onSurface,
            ),
            const SizedBox(width: 8),
            _ScoreMiniBox(
              label: 'RATA-RATA',
              value: '$avgScore',
              color: AppColors.amber,
            ),
            const SizedBox(width: 8),
            _ScoreMiniBox(
              label: 'LULUS ≥75',
              value: '$passedCount/${scored.length}',
              color: AppColors.emerald,
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Kunci Jawaban Referensi Server
        if (hasQuestions)
          Card(
            child: ExpansionTile(
              title: Text(
                'Kunci Jawaban Referensi (${activeExam.questions.length} Soal)',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              children: [
                for (var idx = 0; idx < activeExam.questions.length; idx++) ...[
                  _ReferenceKeyItem(
                    index: idx,
                    question: activeExam.questions[idx],
                    correctIdx: _instructorKeys[activeExam.questions[idx].id],
                  ),
                ],
              ],
            ),
          ),
        const SizedBox(height: 12),

        // Rekap Perbandingan Gain (Posttest - Pretest) dengan resolusi class_members
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Rekap Nilai & Gain (Δ = Posttest - Pretest) — P$_selectedMeetingNo',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 10),
                if (gainRows.isEmpty)
                  Text(
                    'Belum ada riwayat evaluasi mahasiswa untuk Pertemuan $_selectedMeetingNo.',
                    style: theme.textTheme.bodySmall,
                  )
                else
                  for (final row in gainRows)
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
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  row.displayName,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                  ),
                                ),
                                if (row.email.isNotEmpty &&
                                    row.email != row.displayName)
                                  Text(
                                    row.email,
                                    style: theme.textTheme.labelSmall,
                                  ),
                                const SizedBox(height: 4),
                                Text(
                                  'Pre: ${row.pretestScore ?? '—'}  •  Post: ${row.posttestScore ?? '—'}',
                                  style: const TextStyle(
                                    fontFamily: 'monospace',
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: (row.gainDelta == null
                                      ? theme.colorScheme.onSurface
                                          .withValues(alpha: 0.2)
                                      : row.gainDelta! >= 0
                                          ? AppColors.emerald
                                          : AppColors.rose)
                                  .withValues(alpha: 0.16),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              row.gainDelta == null
                                  ? 'Δ —'
                                  : 'Δ ${row.gainDelta! >= 0 ? '+${row.gainDelta}' : '${row.gainDelta}'}',
                              style: TextStyle(
                                fontFamily: 'monospace',
                                fontWeight: FontWeight.w900,
                                fontSize: 12,
                                color: row.gainDelta == null
                                    ? theme.colorScheme.onSurface
                                        .withValues(alpha: 0.6)
                                    : row.gainDelta! >= 0
                                        ? AppColors.emerald
                                        : AppColors.rose,
                              ),
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
    );
  }
}

class _ScoreMiniBox extends StatelessWidget {
  const _ScoreMiniBox({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: theme.scaffoldBackgroundColor,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: theme.dividerColor),
        ),
        child: Column(
          children: [
            Text(
              label,
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 9,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              value,
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 17,
                fontWeight: FontWeight.w900,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MetaTag extends StatelessWidget {
  const _MetaTag({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(6),
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

class _ReferenceKeyItem extends StatelessWidget {
  const _ReferenceKeyItem({
    required this.index,
    required this.question,
    required this.correctIdx,
  });

  final int index;
  final ExamQuestion question;
  final int? correctIdx;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: theme.scaffoldBackgroundColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '[SOAL ${index + 1}] ${question.question}',
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
          ),
          const SizedBox(height: 6),
          for (var optIdx = 0; optIdx < question.options.length; optIdx++)
            Padding(
              padding: const EdgeInsets.only(bottom: 3),
              child: Text(
                '${correctIdx == optIdx ? '✓ ' : ''}${String.fromCharCode(65 + optIdx)}. ${question.options[optIdx]}',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight:
                      correctIdx == optIdx ? FontWeight.w800 : FontWeight.w400,
                  color: correctIdx == optIdx ? AppColors.emerald : null,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
