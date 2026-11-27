import 'package:flutter/material.dart';

import '../../../core/models/exam_models.dart';
import '../../../core/models/lms_class.dart';
import '../../../core/services/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/aiken_parser.dart';
import '../../../core/utils/exam_draft_store.dart';
import '../../../core/utils/picked_file_helper.dart';

/// Editor Soal & Kunci Evaluasi untuk Dosen/Admin (`action: 'save_exam'`)
/// dengan dukungan 5 opsi default (A–E, dinamis 2–6 opsi), indikator bobot rata per soal,
/// serta panel Import Format Aiken (paste teks atau unggah `.txt` via `picked_file_helper.dart`).
class InstructorExamEditorScreen extends StatefulWidget {
  const InstructorExamEditorScreen({
    super.key,
    required this.lmsClass,
    required this.meetingNo,
    required this.examType,
    required this.initialExam,
    required this.initialAnswerKey,
    required this.apiClient,
  });

  final LmsClass lmsClass;
  final int meetingNo;
  final String examType;
  final MeetingExam? initialExam;
  final Map<String, int> initialAnswerKey;
  final ApiClient apiClient;

  @override
  State<InstructorExamEditorScreen> createState() =>
      _InstructorExamEditorScreenState();
}

class _InstructorExamEditorScreenState
    extends State<InstructorExamEditorScreen> {
  final _titleCtrl = TextEditingController();
  final _durationCtrl = TextEditingController();
  final _deadlineCtrl = TextEditingController();
  final _aikenCtrl = TextEditingController();

  String _editorMode = 'visual'; // 'visual' | 'aiken'
  String _status = 'published';
  List<ExamQuestion> _questions = <ExamQuestion>[];
  Map<String, int> _answerKey = <String, int>{};

  bool _saving = false;
  String? _feedbackText;
  bool _feedbackIsError = false;

  @override
  void initState() {
    super.initState();
    final ex = widget.initialExam;
    final defaultTitle =
        '${widget.examType == 'posttest' ? 'Post-test' : 'Pretest'} Pertemuan ${widget.meetingNo}';

    _titleCtrl.text = ex != null && ex.title.isNotEmpty ? ex.title : defaultTitle;
    _status = ex?.status ?? 'published';
    _durationCtrl.text = '${ex?.durationMinutes ?? 15}';
    _deadlineCtrl.text = ex?.deadline ?? '';

    if (ex != null && ex.questions.isNotEmpty) {
      _questions = ex.questions
          .map(
            (q) => ExamQuestion(
              id: q.id,
              question: q.question,
              options: List<String>.from(q.options),
            ),
          )
          .toList();
      _answerKey = Map<String, int>.from(widget.initialAnswerKey);
    } else {
      _questions = <ExamQuestion>[ExamQuestion.empty(1)];
      _answerKey = <String, int>{'q1': 0};
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _durationCtrl.dispose();
    _deadlineCtrl.dispose();
    _aikenCtrl.dispose();
    super.dispose();
  }

  void _addQuestion() {
    final usedNums = _questions.map((q) {
      final digits = q.id.replaceAll(RegExp(r'\D+'), '');
      return int.tryParse(digits) ?? 0;
    });
    final maxNum = usedNums.isEmpty
        ? _questions.length
        : usedNums.reduce((a, b) => a > b ? a : b);
    final nextNum = (maxNum > _questions.length ? maxNum : _questions.length) + 1;
    final newQ = ExamQuestion.empty(nextNum);

    setState(() {
      _questions = <ExamQuestion>[..._questions, newQ];
      _answerKey = <String, int>{..._answerKey, newQ.id: 0};
    });
  }

  void _removeQuestion(String qId) {
    if (_questions.length <= 1) return;
    setState(() {
      _questions =
          _questions.where((q) => q.id != qId).toList(growable: true);
      final nextKey = Map<String, int>.from(_answerKey)..remove(qId);
      _answerKey = nextKey;
    });
  }

  void _updateQuestionText(String qId, String text) {
    setState(() {
      _questions = _questions
          .map((q) => q.id == qId ? q.copyWith(question: text) : q)
          .toList(growable: true);
    });
  }

  void _updateOptionText(String qId, int optIdx, String value) {
    setState(() {
      _questions = _questions.map((q) {
        if (q.id != qId) return q;
        final nextOpts = List<String>.from(q.options);
        nextOpts[optIdx] = value;
        return q.copyWith(options: nextOpts);
      }).toList(growable: true);
    });
  }

  void _addOption(String qId) {
    setState(() {
      _questions = _questions.map((q) {
        if (q.id != qId || q.options.length >= 6) return q;
        return q.copyWith(options: <String>[...q.options, '']);
      }).toList(growable: true);
    });
  }

  void _removeOption(String qId, int optIdx) {
    final idx = _questions.indexWhere((q) => q.id == qId);
    if (idx < 0 || _questions[idx].options.length <= 2) return;
    final nextLen = _questions[idx].options.length - 1;

    setState(() {
      _questions = _questions.map((q) {
        if (q.id != qId) return q;
        final filtered = <String>[];
        for (var i = 0; i < q.options.length; i++) {
          if (i != optIdx) filtered.add(q.options[i]);
        }
        return q.copyWith(options: filtered);
      }).toList(growable: true);

      final prevKey = _answerKey[qId] ?? 0;
      final shifted =
          prevKey == optIdx ? 0 : (prevKey > optIdx ? prevKey - 1 : prevKey);
      _answerKey = <String, int>{
        ..._answerKey,
        qId: shifted.clamp(0, nextLen - 1),
      };
    });
  }

  Future<void> _pickAikenTxtFile() async {
    try {
      final picked = await pickLocalTextFile();
      if (picked == null || !mounted) return;
      setState(() {
        _aikenCtrl.text = picked.content;
        _feedbackText =
            'Berkas "${picked.name}" (${picked.sizeLabel}) berhasil dimuat ke editor Aiken.';
        _feedbackIsError = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _feedbackText = 'Gagal membaca berkas .txt: $e';
        _feedbackIsError = true;
      });
    }
  }

  void _applyAikenImport({required bool replaceAll}) {
    final usedNums = _questions.map((q) {
      final digits = q.id.replaceAll(RegExp(r'\D+'), '');
      return int.tryParse(digits) ?? 0;
    });
    final maxNum = usedNums.isEmpty
        ? _questions.length
        : usedNums.reduce((a, b) => a > b ? a : b);
    final startIndex = replaceAll ? 1 : maxNum + 1;

    final parsed = AikenParser.parse(
      _aikenCtrl.text,
      startIndex: startIndex,
    );

    if (parsed.questions.isEmpty) {
      setState(() {
        _feedbackText = 'Tidak ada soal format Aiken valid yang dapat diimpor.';
        _feedbackIsError = true;
      });
      return;
    }

    final importedQuestions = parsed.questions
        .map(
          (item) => ExamQuestion(
            id: item.id,
            question: item.question,
            options: List<String>.from(item.options),
          ),
        )
        .toList();

    setState(() {
      if (replaceAll) {
        _questions = importedQuestions;
        _answerKey = Map<String, int>.from(parsed.answerKey);
      } else {
        _questions = <ExamQuestion>[..._questions, ...importedQuestions];
        _answerKey = <String, int>{..._answerKey, ...parsed.answerKey};
      }
      _aikenCtrl.clear();
      _editorMode = 'visual';
      _feedbackText =
          'Berhasil mengimpor ${importedQuestions.length} soal Aiken ke draf. Klik Simpan ke Server untuk mempublikasikan.';
      _feedbackIsError = false;
    });
  }

  Future<void> _pickDeadlineDateTime() async {
    final now = DateTime.now();
    final pickedDate = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 7)),
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 365 * 2)),
    );
    if (pickedDate == null || !mounted) return;

    final pickedTime = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 23, minute: 59),
    );
    if (!mounted) return;

    final combined = DateTime(
      pickedDate.year,
      pickedDate.month,
      pickedDate.day,
      pickedTime?.hour ?? 23,
      pickedTime?.minute ?? 59,
    );
    setState(() {
      _deadlineCtrl.text = combined.toIso8601String();
    });
  }

  Future<void> _saveToServer() async {
    if (_saving) return;

    final duration = int.tryParse(_durationCtrl.text.trim()) ?? -1;
    if (duration < 1 || duration > 180) {
      setState(() {
        _feedbackText =
            'Durasi ujian harus berupa bilangan bulat 1 hingga 180 menit.';
        _feedbackIsError = true;
      });
      return;
    }

    String? normalizedDeadline;
    final rawDeadline = _deadlineCtrl.text.trim();
    if (rawDeadline.isNotEmpty) {
      final parsedDt = DateTime.tryParse(rawDeadline);
      if (parsedDt == null) {
        setState(() {
          _feedbackText =
              'Format batas waktu (deadline) tidak valid. Gunakan ISO-8601 atau pemilih tanggal.';
          _feedbackIsError = true;
        });
        return;
      }
      normalizedDeadline = parsedDt.toUtc().toIso8601String();
    }

    if (_questions.isEmpty) {
      setState(() {
        _feedbackText = 'Tambahkan minimal 1 soal evaluasi.';
        _feedbackIsError = true;
      });
      return;
    }

    final cleanQuestions = <Map<String, dynamic>>[];
    final cleanKey = <String, int>{};

    for (var i = 0; i < _questions.length; i++) {
      final q = _questions[i];
      final cleanQText = q.question.trim();
      final cleanOpts =
          q.options.map((o) => o.trim()).toList(growable: false);
      if (cleanQText.isEmpty ||
          cleanOpts.length < 2 ||
          cleanOpts.length > 6 ||
          cleanOpts.any((o) => o.isEmpty)) {
        setState(() {
          _feedbackText =
              'Soal ${i + 1} wajib memiliki teks pertanyaan dan 2–6 pilihan jawaban terisi.';
          _feedbackIsError = true;
        });
        return;
      }
      final refIdx = _answerKey[q.id] ?? 0;
      if (refIdx < 0 || refIdx >= cleanOpts.length) {
        setState(() {
          _feedbackText =
              'Kunci jawaban untuk Soal ${i + 1} belum valid.';
          _feedbackIsError = true;
        });
        return;
      }
      cleanQuestions.add(<String, dynamic>{
        'id': q.id.trim(),
        'question': cleanQText,
        'options': cleanOpts,
      });
      cleanKey[q.id.trim()] = refIdx;
    }

    setState(() {
      _saving = true;
      _feedbackText = null;
      _feedbackIsError = false;
    });

    try {
      await widget.apiClient.postSaveExam(
        classId: widget.lmsClass.id,
        meetingNo: widget.meetingNo,
        examType: widget.examType,
        title: _titleCtrl.text,
        status: _status,
        durationMinutes: duration,
        deadline: normalizedDeadline,
        questions: cleanQuestions,
        answerKey: cleanKey,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _feedbackText = e.message;
        _feedbackIsError = true;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _feedbackText = 'Gagal menyimpan soal evaluasi ke server: $e';
        _feedbackIsError = true;
      });
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pointsPerQ =
        ExamDraftStore.computePointsPerQuestion(_questions.length);
    final aikenPreview = _editorMode == 'aiken'
        ? AikenParser.parse(_aikenCtrl.text)
        : const AikenParseResult(
            questions: <AikenQuestion>[],
            answerKey: <String, int>{},
            errors: <AikenParseError>[],
          );

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Editor ${widget.examType.toUpperCase()} — P${widget.meetingNo}',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            Text(
              '${_questions.length} soal • $pointsPerQ poin/soal (Total 100)',
              style: const TextStyle(fontSize: 11, color: AppColors.emerald),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(
                  value: 'visual',
                  icon: Icon(Icons.edit_note, size: 18),
                  label: Text('Editor Visual'),
                ),
                ButtonSegment(
                  value: 'aiken',
                  icon: Icon(Icons.upload_file, size: 18),
                  label: Text('Import Aiken'),
                ),
              ],
              selected: <String>{_editorMode},
              onSelectionChanged: (sel) =>
                  setState(() => _editorMode = sel.first),
            ),
          ),
          if (_feedbackText != null)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: (_feedbackIsError
                        ? AppColors.rose
                        : AppColors.emerald)
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
          Expanded(
            child: _editorMode == 'aiken'
                ? _buildAikenImportPanel(context, aikenPreview)
                : _buildVisualEditor(context, theme),
          ),
          if (_editorMode == 'visual')
            Container(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
              decoration: BoxDecoration(
                color: theme.scaffoldBackgroundColor,
                border: Border(top: BorderSide(color: theme.dividerColor)),
              ),
              child: SafeArea(
                top: false,
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _saving ? null : _saveToServer,
                    icon: _saving
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.black,
                            ),
                          )
                        : const Icon(Icons.save_outlined),
                    label: Text(
                      _saving
                          ? 'Menyimpan ke Server...'
                          : 'Simpan Soal & Kunci ke Server',
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildAikenImportPanel(
    BuildContext context,
    AikenParseResult preview,
  ) {
    final theme = Theme.of(context);
    final hasInput = _aikenCtrl.text.trim().isNotEmpty;
    final previewPoints = ExamDraftStore.computePointsPerQuestion(
      preview.questions.length,
    );

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'IMPOR MASSAL FORMAT AIKEN',
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w800,
                    color: AppColors.amber,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Mendukung opsi A. atau A) (2–6 opsi, default 5 opsi A–E) dan baris ANSWER: X (case-insensitive).',
                  style: theme.textTheme.bodySmall,
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () {
                        setState(
                          () => _aikenCtrl.text = AikenParser.sampleTemplate,
                        );
                      },
                      icon: const Icon(Icons.text_snippet_outlined, size: 16),
                      label: const Text('Muat Contoh'),
                    ),
                    OutlinedButton.icon(
                      onPressed: _pickAikenTxtFile,
                      icon: const Icon(Icons.file_open_outlined, size: 16),
                      label: const Text('Unggah .txt'),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _aikenCtrl,
                  maxLines: 10,
                  onChanged: (_) => setState(() {}),
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                  decoration: const InputDecoration(
                    labelText: 'Teks Soal Format Aiken',
                    alignLabelWithHint: true,
                    hintText: AikenParser.sampleTemplate,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 10,
                  runSpacing: 6,
                  children: [
                    Text(
                      '${preview.questions.length} soal valid'
                      '${preview.questions.isNotEmpty ? ' • $previewPoints poin/soal' : ''}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.emerald,
                      ),
                    ),
                    if (hasInput && preview.errors.isNotEmpty)
                      Text(
                        '${preview.errors.length} baris error',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.rose,
                        ),
                      ),
                  ],
                ),
                if (hasInput && preview.errors.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.rose.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: AppColors.rose.withValues(alpha: 0.4),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (final err in preview.errors)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Text(
                              err.message,
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.rose,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: preview.questions.isEmpty
                            ? null
                            : () => _applyAikenImport(replaceAll: false),
                        child: const Text('Tambah'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: preview.questions.isEmpty
                            ? null
                            : () => _applyAikenImport(replaceAll: true),
                        child: const Text('Ganti Semua'),
                      ),
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

  Widget _buildVisualEditor(BuildContext context, ThemeData theme) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: _titleCtrl,
                  decoration: const InputDecoration(labelText: 'Judul Evaluasi'),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: _status,
                        decoration: const InputDecoration(labelText: 'Status'),
                        items: const [
                          DropdownMenuItem(
                            value: 'published',
                            child: Text('Published'),
                          ),
                          DropdownMenuItem(
                            value: 'draft',
                            child: Text('Draft'),
                          ),
                          DropdownMenuItem(
                            value: 'archived',
                            child: Text('Archived'),
                          ),
                        ],
                        onChanged: (v) {
                          if (v != null) setState(() => _status = v);
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _durationCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Durasi (1–180 mnt)',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _deadlineCtrl,
                  decoration: InputDecoration(
                    labelText: 'Batas Waktu (Opsional ISO)',
                    suffixIcon: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_deadlineCtrl.text.trim().isNotEmpty)
                          IconButton(
                            tooltip: 'Hapus Deadline',
                            onPressed: () =>
                                setState(() => _deadlineCtrl.clear()),
                            icon: const Icon(Icons.clear, size: 18),
                          ),
                        IconButton(
                          tooltip: 'Pilih Tanggal',
                          onPressed: _pickDeadlineDateTime,
                          icon: const Icon(Icons.event, size: 18),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        for (var qIdx = 0; qIdx < _questions.length; qIdx++)
          _buildQuestionCard(context, theme, qIdx, _questions[qIdx]),
        const SizedBox(height: 6),
        OutlinedButton.icon(
          onPressed: _questions.length >= 50 ? null : _addQuestion,
          icon: const Icon(Icons.add),
          label: Text('Tambah Soal Baru (${_questions.length}/50)'),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildQuestionCard(
    BuildContext context,
    ThemeData theme,
    int qIdx,
    ExamQuestion q,
  ) {
    final keyIdx = (_answerKey[q.id] ?? 0).clamp(0, q.options.length - 1);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  'SOAL ${qIdx + 1} (${q.id})',
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w800,
                    color: AppColors.amber,
                  ),
                ),
                const Spacer(),
                if (q.options.length < 6)
                  TextButton.icon(
                    onPressed: () => _addOption(q.id),
                    icon: const Icon(Icons.add_circle_outline, size: 16),
                    label: Text('Opsi (${q.options.length}/6)'),
                  ),
                if (_questions.length > 1)
                  IconButton(
                    tooltip: 'Hapus Soal',
                    onPressed: () => _removeQuestion(q.id),
                    icon: const Icon(
                      Icons.delete_outline,
                      size: 18,
                      color: AppColors.rose,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            TextFormField(
              key: ValueKey('qtext_${q.id}'),
              initialValue: q.question,
              maxLines: 2,
              onChanged: (v) => _updateQuestionText(q.id, v),
              decoration: const InputDecoration(
                labelText: 'Teks Pertanyaan',
              ),
            ),
            const SizedBox(height: 10),
            for (var optIdx = 0; optIdx < q.options.length; optIdx++)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        key: ValueKey('opt_${q.id}_${optIdx}_${q.options.length}'),
                        initialValue: q.options[optIdx],
                        onChanged: (v) => _updateOptionText(q.id, optIdx, v),
                        decoration: InputDecoration(
                          labelText: 'Opsi ${String.fromCharCode(65 + optIdx)}',
                          isDense: true,
                        ),
                      ),
                    ),
                    if (q.options.length > 2)
                      IconButton(
                        tooltip: 'Hapus Opsi',
                        onPressed: () => _removeOption(q.id, optIdx),
                        icon: const Icon(
                          Icons.close,
                          size: 16,
                          color: AppColors.rose,
                        ),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 4),
            DropdownButtonFormField<int>(
              initialValue: keyIdx,
              decoration: const InputDecoration(
                labelText: 'Kunci Jawaban Referensi',
                isDense: true,
              ),
              items: List<DropdownMenuItem<int>>.generate(
                q.options.length,
                (i) => DropdownMenuItem<int>(
                  value: i,
                  child: Text('Opsi ${String.fromCharCode(65 + i)}'),
                ),
              ),
              onChanged: (v) {
                if (v != null) {
                  setState(() {
                    _answerKey = <String, int>{..._answerKey, q.id: v};
                  });
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}
