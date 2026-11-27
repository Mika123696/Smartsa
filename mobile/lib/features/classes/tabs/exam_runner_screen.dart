import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/models/exam_models.dart';
import '../../../core/models/lms_class.dart';
import '../../../core/models/user_profile.dart';
import '../../../core/services/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/exam_draft_store.dart';

/// Layar pengerjaan evaluasi Pretest / Posttest (Student Exam-Safe Runner)
/// dengan countdown server `examExpiresAt`, navigasi nomor soal dinamis (2–6 opsi),
/// autosave draf `SharedPreferences`, serta auto-submit saat waktu habis.
class ExamRunnerScreen extends StatefulWidget {
  const ExamRunnerScreen({
    super.key,
    required this.lmsClass,
    required this.exam,
    required this.profile,
    required this.apiClient,
    required this.examExpiresAtMs,
    this.initialAnswers = const <String, int>{},
  });

  final LmsClass lmsClass;
  final MeetingExam exam;
  final UserProfile profile;
  final ApiClient apiClient;
  final int examExpiresAtMs;
  final Map<String, int> initialAnswers;

  @override
  State<ExamRunnerScreen> createState() => _ExamRunnerScreenState();
}

class _ExamRunnerScreenState extends State<ExamRunnerScreen> {
  late Map<String, int> _answers;
  int _currentIndex = 0;
  int _remainingSeconds = 0;
  bool _submitting = false;
  bool _autoSubmitted = false;
  String? _errorText;
  Timer? _timer;

  List<ExamQuestion> get _questions => widget.exam.questions;

  @override
  void initState() {
    super.initState();
    _answers = Map<String, int>.from(widget.initialAnswers);
    _recomputeRemaining();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      _recomputeRemaining();
      if (_remainingSeconds <= 0 && !_autoSubmitted && !_submitting) {
        _autoSubmitted = true;
        _timer?.cancel();
        unawaited(_submitToServer());
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _recomputeRemaining() {
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    final diffSecs = ((widget.examExpiresAtMs - nowMs) / 1000).ceil();
    setState(() {
      _remainingSeconds = diffSecs > 0 ? diffSecs : 0;
    });
  }

  Future<void> _selectAnswer(String qId, int optIdx) async {
    if (_submitting) return;
    setState(() {
      _answers = <String, int>{..._answers, qId: optIdx};
      _errorText = null;
    });
    await ExamDraftStore.writeDraftAnswers(
      classId: widget.lmsClass.id,
      meetingNo: widget.exam.meetingNo,
      examType: widget.exam.examType,
      uid: widget.profile.uid,
      answers: _answers,
    );
  }

  Future<void> _confirmAndSubmit() async {
    if (_submitting) return;
    final answered = _questions.where((q) => _answers.containsKey(q.id)).length;
    final total = _questions.length;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Kirim Jawaban Evaluasi?'),
        content: Text(
          answered < total
              ? 'Anda baru menjawab $answered dari $total soal. Yakin ingin mengumpulkan sekarang? Jawaban yang dikumpulkan tidak dapat diubah.'
              : 'Seluruh $total soal sudah terjawab. Kirim jawaban ke server untuk dinilai sekarang?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Periksa Lagi'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Kirim Sekarang'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      await _submitToServer();
    }
  }

  Future<void> _submitToServer() async {
    if (_submitting) return;
    setState(() {
      _submitting = true;
      _errorText = null;
    });

    try {
      final resultMap = await widget.apiClient.postSubmitExam(
        classId: widget.lmsClass.id,
        meetingNo: widget.exam.meetingNo,
        examType: widget.exam.examType,
        answers: _answers,
      );

      await ExamDraftStore.clearDraftAnswers(
        classId: widget.lmsClass.id,
        meetingNo: widget.exam.meetingNo,
        examType: widget.exam.examType,
        uid: widget.profile.uid,
      );

      _timer?.cancel();
      if (!mounted) return;

      final attemptId = (resultMap['attemptId'] ??
              '${widget.lmsClass.id}_m${widget.exam.meetingNo}_${widget.exam.examType}_${widget.profile.uid}')
          .toString();
      final attempt = ExamAttempt.fromMap(attemptId, resultMap);
      Navigator.of(context).pop(attempt);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _errorText = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorText = 'Gagal mengirim lembar evaluasi: $e');
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
    final currentQuestion = _questions[_currentIndex];
    final answeredCount =
        _questions.where((q) => _answers.containsKey(q.id)).length;
    final isLowTime = _remainingSeconds <= 60;

    return PopScope(
      canPop: !_submitting,
      child: Scaffold(
        appBar: AppBar(
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.exam.title.isNotEmpty
                    ? widget.exam.title
                    : '${widget.exam.examType == 'posttest' ? 'Post-test' : 'Pretest'} P${widget.exam.meetingNo}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
              ),
              Text(
                '$answeredCount / ${_questions.length} terjawab • ${widget.exam.effectivePointsPerQuestion} poin/soal',
                style: theme.textTheme.labelSmall,
              ),
            ],
          ),
          actions: [
            Container(
              margin: const EdgeInsets.only(right: 12),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: (isLowTime ? AppColors.rose : AppColors.amber)
                    .withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: (isLowTime ? AppColors.rose : AppColors.amber)
                      .withValues(alpha: 0.55),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.timer_outlined,
                    size: 15,
                    color: isLowTime ? AppColors.rose : AppColors.amber,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    _formatSeconds(_remainingSeconds),
                    style: TextStyle(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w900,
                      fontSize: 13,
                      color: isLowTime
                          ? AppColors.rose
                          : (isDark ? AppColors.amber : AppColors.amberDark),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        body: Column(
          children: [
            // Banner Protokol Exam Lockout AI Tutor
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              color: AppColors.rose.withValues(alpha: 0.14),
              child: const Row(
                children: [
                  Icon(Icons.lock, size: 15, color: AppColors.rose),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'LOCKOUT AI AKTIF: AI Tutor dinonaktifkan di server selama sesi evaluasi berlangsung.',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.rose,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Navigasi Nomor Soal Horizontal
            SizedBox(
              height: 54,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 8,
                ),
                itemCount: _questions.length,
                separatorBuilder: (_, _) => const SizedBox(width: 6),
                itemBuilder: (context, idx) {
                  final q = _questions[idx];
                  final isCurrent = idx == _currentIndex;
                  final isAnswered = _answers.containsKey(q.id);
                  return InkWell(
                    borderRadius: BorderRadius.circular(8),
                    onTap: _submitting
                        ? null
                        : () => setState(() => _currentIndex = idx),
                    child: Container(
                      width: 38,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: isCurrent
                            ? AppColors.amber
                            : isAnswered
                                ? AppColors.emerald.withValues(alpha: 0.2)
                                : theme.cardColor,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: isCurrent
                              ? AppColors.amber
                              : isAnswered
                                  ? AppColors.emerald
                                  : theme.dividerColor,
                          width: isCurrent ? 2 : 1,
                        ),
                      ),
                      child: Text(
                        '${idx + 1}',
                        style: TextStyle(
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                          color: isCurrent
                              ? Colors.black
                              : isAnswered
                                  ? AppColors.emerald
                                  : theme.colorScheme.onSurface,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const Divider(height: 1),

            // Konten Soal & Pilihan Jawaban
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                    'SOAL ${_currentIndex + 1} DARI ${_questions.length}',
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w800,
                      color: isDark ? AppColors.cyanDark : AppColors.cyanLight,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        currentQuestion.question,
                        style: theme.textTheme.bodyLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                          height: 1.45,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  for (var optIdx = 0;
                      optIdx < currentQuestion.options.length;
                      optIdx++)
                    _OptionTile(
                      letter: String.fromCharCode(65 + optIdx),
                      text: currentQuestion.options[optIdx],
                      selected: _answers[currentQuestion.id] == optIdx,
                      enabled: !_submitting,
                      onTap: () => _selectAnswer(currentQuestion.id, optIdx),
                    ),
                  if (_errorText != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.rose.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: AppColors.rose.withValues(alpha: 0.45),
                        ),
                      ),
                      child: Text(
                        _errorText!,
                        style: const TextStyle(
                          color: AppColors.rose,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),

            // Bar Aksi Bawah (Sebelumnya, Selanjutnya, Kirim)
            Container(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
              decoration: BoxDecoration(
                color: theme.scaffoldBackgroundColor,
                border: Border(top: BorderSide(color: theme.dividerColor)),
              ),
              child: SafeArea(
                top: false,
                child: Row(
                  children: [
                    if (_currentIndex > 0)
                      OutlinedButton.icon(
                        onPressed: _submitting
                            ? null
                            : () => setState(() => _currentIndex--),
                        icon: const Icon(Icons.chevron_left),
                        label: const Text('Sebelumnya'),
                      ),
                    if (_currentIndex > 0) const SizedBox(width: 8),
                    Expanded(
                      child: _currentIndex < _questions.length - 1
                          ? ElevatedButton.icon(
                              onPressed: _submitting
                                  ? null
                                  : () => setState(() => _currentIndex++),
                              icon: const Icon(Icons.chevron_right),
                              label: const Text('Soal Berikutnya'),
                            )
                          : ElevatedButton.icon(
                              onPressed:
                                  _submitting ? null : _confirmAndSubmit,
                              icon: _submitting
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.black,
                                      ),
                                    )
                                  : const Icon(Icons.check_circle_outline),
                              label: Text(
                                _submitting
                                    ? 'Menilai...'
                                    : 'Kirim Evaluasi',
                              ),
                            ),
                    ),
                    if (_currentIndex < _questions.length - 1) ...[
                      const SizedBox(width: 8),
                      TextButton(
                        onPressed: _submitting ? null : _confirmAndSubmit,
                        child: const Text('Kirim'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _formatSeconds(int seconds) {
    final safe = seconds < 0 ? 0 : seconds;
    final mins = safe ~/ 60;
    final secs = safe % 60;
    return '${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }
}

class _OptionTile extends StatelessWidget {
  const _OptionTile({
    required this.letter,
    required this.text,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final String letter;
  final String text;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: enabled ? onTap : null,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.amber.withValues(alpha: 0.16)
                : theme.cardColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? AppColors.amber : theme.dividerColor,
              width: selected ? 1.8 : 1,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: selected
                      ? AppColors.amber
                      : theme.colorScheme.onSurface.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: Text(
                  letter,
                  style: TextStyle(
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                    color: selected
                        ? Colors.black
                        : theme.colorScheme.onSurface,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  text,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    color: selected
                        ? (isDark ? AppColors.amber : AppColors.amberDark)
                        : theme.colorScheme.onSurface,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
