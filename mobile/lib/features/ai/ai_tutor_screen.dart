import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';

import '../../core/models/lms_class.dart';
import '../../core/models/user_profile.dart';
import '../../core/services/api_client.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/ai_markdown.dart';
import '../../core/utils/url_utils.dart';

class _ChatMessage {
  const _ChatMessage({
    required this.isUser,
    required this.text,
    this.isError = false,
    this.note,
  });

  final bool isUser;
  final String text;
  final bool isError;
  final String? note;
}

/// Layar chat AI Tutor Smartsa terhubung langsung ke `POST /api/ai`
/// dengan pemantauan lockout ujian real-time di Firestore.
class AiTutorScreen extends StatefulWidget {
  const AiTutorScreen({
    super.key,
    required this.profile,
    required this.classes,
    required this.apiClient,
    required this.firestoreService,
  });

  final UserProfile profile;
  final List<LmsClass> classes;
  final ApiClient apiClient;
  final FirestoreService firestoreService;

  @override
  State<AiTutorScreen> createState() => _AiTutorScreenState();
}

class _AiTutorScreenState extends State<AiTutorScreen> {
  final _promptCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  final List<_ChatMessage> _messages = <_ChatMessage>[];
  StreamSubscription<String?>? _examLockSub;

  String? _selectedClassId;
  String? _activeExamClassId;
  String _activeModel = '';
  int _remainingQuota = 20;
  bool _sending = false;
  String? _bannerError;

  bool get _isTeacher => widget.profile.isLecturer || widget.profile.isAdmin;
  bool get _isExamLocked => _activeExamClassId != null;

  @override
  void initState() {
    super.initState();
    _messages.add(
      _ChatMessage(
        isUser: false,
        text: _isTeacher
            ? 'Halo Bapak/Ibu Pendidik! Saya Teaching Assistant Smartsa LMS berbasis Gemini AI (server-side). Saya dapat membantu menyusun draf silabus, soal Taksonomi Bloom, dan rubrik penilaian.'
            : 'Halo! Saya Learning Assistant Smartsa LMS berbasis Gemini AI (server-side). Tanyakan konsep mata kuliah, analogi sederhana, atau rangkuman materi.',
      ),
    );
    _subscribeExamLock();
  }

  @override
  void didUpdateWidget(covariant AiTutorScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.profile.uid != widget.profile.uid) {
      _subscribeExamLock();
    }
    if (_selectedClassId != null &&
        !widget.classes.any((c) => c.id == _selectedClassId)) {
      _selectedClassId = null;
    }
  }

  void _subscribeExamLock() {
    _examLockSub?.cancel();
    _examLockSub = widget.firestoreService
        .watchActiveExamClassId(widget.profile.uid)
        .listen((lockedClassId) {
      if (!mounted) return;
      setState(() {
        _activeExamClassId = lockedClassId;
      });
    }, onError: (_) {});
  }

  @override
  void dispose() {
    _examLockSub?.cancel();
    _promptCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  String _buildCourseContext() {
    final selected = widget.classes
        .where((c) => c.id == _selectedClassId)
        .firstOrNull;
    if (selected == null) {
      return 'Konteks Akademik Smartsa LMS';
    }
    final parts = <String>[
      'Mata Kuliah: ${selected.displayTitle} (${selected.code.isEmpty ? '-' : selected.code})',
      if (selected.description.isNotEmpty) 'Deskripsi: ${selected.description}',
      if (selected.meetings.isNotEmpty)
        'Daftar Pertemuan: ${selected.meetings.map((m) => 'P${m.order}: ${m.title}').join('; ')}',
    ];
    return parts.join('\n');
  }

  Future<void> _sendPrompt([String? presetPrompt]) async {
    final text = (presetPrompt ?? _promptCtrl.text).trim();
    if (text.isEmpty || _sending || _isExamLocked) return;

    final historySnapshot = _messages
        .where((m) => !m.isError)
        .toList()
        .reversed
        .take(8)
        .toList()
        .reversed
        .map(
          (m) => <String, String>{
            'role': m.isUser ? 'user' : 'model',
            'text': m.text,
          },
        )
        .toList(growable: false);

    setState(() {
      _messages.add(_ChatMessage(isUser: true, text: text));
      if (presetPrompt == null) {
        _promptCtrl.clear();
      }
      _sending = true;
      _bannerError = null;
    });
    _scrollToBottom();

    try {
      final res = await widget.apiClient.postAi(
        mode: _isTeacher ? 'teaching' : 'learning',
        prompt: text,
        context: _buildCourseContext(),
        history: historySnapshot,
        isExamActive: _isExamLocked,
      );

      if (!mounted) return;
      final responseText =
          (res['response_text'] ?? 'Tidak ada respons dari model AI.')
              .toString()
              .trim();
      final modelName = (res['model'] ?? '').toString().trim();
      final quota = res['remaining_quota'];
      final serverNote = res['note']?.toString().trim();

      setState(() {
        if (modelName.isNotEmpty) {
          _activeModel = modelName;
        }
        if (quota is num) {
          _remainingQuota = quota.toInt();
        } else {
          _remainingQuota = (_remainingQuota - 1).clamp(0, 20);
        }
        _messages.add(
          _ChatMessage(
            isUser: false,
            text: responseText,
            note: (serverNote != null && serverNote.isNotEmpty)
                ? serverNote
                : null,
          ),
        );
      });
      _scrollToBottom();
    } on ApiException catch (e) {
      if (!mounted) return;
      final honestError = _formatHonestApiError(e);
      setState(() {
        _bannerError = honestError;
        _messages.add(
          _ChatMessage(isUser: false, text: honestError, isError: true),
        );
      });
      _scrollToBottom();
    } catch (e) {
      if (!mounted) return;
      final msg = 'Gagal menghubungi layanan AI server: $e';
      setState(() {
        _bannerError = msg;
        _messages.add(_ChatMessage(isUser: false, text: msg, isError: true));
      });
      _scrollToBottom();
    } finally {
      if (mounted) {
        setState(() => _sending = false);
      }
    }
  }

  String _formatHonestApiError(ApiException e) {
    if (e.code == 'EXAM_LOCKOUT' || e.statusCode == 403) {
      return 'AKSES AI DITOLAK (403 EXAM_LOCKOUT): Anda sedang memiliki sesi ujian aktif. Selesaikan ujian terlebih dahulu sebelum menggunakan AI Tutor.';
    }
    if (e.code == 'RATE_LIMIT_EXCEEDED' || e.statusCode == 429) {
      final retryNote = e.retryAfterSeconds != null
          ? ' Coba lagi dalam ${e.retryAfterSeconds} detik.'
          : '';
      return 'Batas permintaan AI tercapai (429 RATE_LIMIT_EXCEEDED).$retryNote';
    }
    if (e.code == 'GEMINI_OVERLOADED' ||
        e.statusCode == 503 ||
        e.statusCode == 502) {
      return 'Layanan Gemini AI sedang padat atau tidak tersedia (${e.statusCode} ${e.code}): ${e.message}';
    }
    return '${e.message} (${e.statusCode} ${e.code})';
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _copyMessage(String rawText) async {
    final normalized = AiMarkdownHelper.normalizeAiMarkdownText(rawText);
    await Clipboard.setData(ClipboardData(text: normalized));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Balasan AI disalin ke clipboard.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final samplePrompts = _isTeacher
        ? const <String>[
            'Buatkan 2 soal pretest pilihan ganda tentang Cloud Firestore NoSQL.',
            'Buat draf rubrik penilaian proyek kelompok Clean Architecture.',
          ]
        : const <String>[
            'Jelaskan perbedaan mendasar SQL dan NoSQL Firestore.',
            'Bagaimana alur Clean Architecture dalam aplikasi Flutter?',
          ];

    return Column(
      children: [
        // Header Model Badge, Kuota & Pemilih Konteks Kelas
        Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            border: Border(
              bottom: BorderSide(color: theme.dividerColor),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        _TagPill(
                          icon: Icons.memory_outlined,
                          label: _activeModel.isNotEmpty
                              ? _activeModel
                              : 'Gemini Server-Side',
                          color: AppColors.amber,
                        ),
                        _TagPill(
                          icon: Icons.bolt_outlined,
                          label: 'Kuota: $_remainingQuota / 20',
                          color: isDark
                              ? AppColors.cyanDark
                              : AppColors.cyanLight,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String?>(
                initialValue: _selectedClassId,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Konteks Mata Kuliah',
                  contentPadding: EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                ),
                items: <DropdownMenuItem<String?>>[
                  const DropdownMenuItem<String?>(
                    value: null,
                    child: Text('Konteks Akademik Umum'),
                  ),
                  ...widget.classes.map(
                    (c) => DropdownMenuItem<String?>(
                      value: c.id,
                      child: Text(
                        c.code.isEmpty
                            ? c.displayTitle
                            : '[${c.code}] ${c.displayTitle}',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ],
                onChanged: (_sending || _isExamLocked)
                    ? null
                    : (val) => setState(() => _selectedClassId = val),
              ),
            ],
          ),
        ),

        // Banner Warning Lockout Ujian atau Error API
        if (_isExamLocked || _bannerError != null)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.rose.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: AppColors.rose.withValues(alpha: 0.45),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.gpp_maybe_outlined,
                  color: AppColors.rose,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _isExamLocked
                        ? 'Sesi ujian aktif terdeteksi ($_activeExamClassId). AI Tutor dinonaktifkan sementara hingga ujian selesai dikumpulkan.'
                        : _bannerError!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.rose,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),

        // Daftar Pesan Chat
        Expanded(
          child: ListView.builder(
            controller: _scrollCtrl,
            padding: const EdgeInsets.all(16),
            itemCount: _messages.length + (_sending ? 1 : 0),
            itemBuilder: (context, index) {
              if (_sending && index == _messages.length) {
                return const _TypingIndicatorBubble();
              }
              final msg = _messages[index];
              return _ChatBubble(
                message: msg,
                onCopy: msg.isUser || msg.isError
                    ? null
                    : () => _copyMessage(msg.text),
              );
            },
          ),
        ),

        // Contoh Cepat
        SizedBox(
          height: 40,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: samplePrompts.length,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (context, idx) {
              final sample = samplePrompts[idx];
              return ActionChip(
                label: Text(
                  sample,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11),
                ),
                onPressed: (_sending || _isExamLocked)
                    ? null
                    : () => _sendPrompt(sample),
              );
            },
          ),
        ),
        const SizedBox(height: 6),

        // Bar Input Prompt
        Container(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            border: Border(top: BorderSide(color: theme.dividerColor)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _promptCtrl,
                  enabled: !_sending && !_isExamLocked,
                  minLines: 1,
                  maxLines: 3,
                  textInputAction: TextInputAction.send,
                  decoration: InputDecoration(
                    hintText: _isExamLocked
                        ? 'AI terkunci selama ujian aktif...'
                        : 'Tanyakan materi atau konsep kuliah...',
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                  ),
                  onSubmitted: (_) => _sendPrompt(),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                height: 46,
                width: 46,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(padding: EdgeInsets.zero),
                  onPressed:
                      (_sending || _isExamLocked) ? null : () => _sendPrompt(),
                  child: const Icon(Icons.send_rounded, size: 20),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TagPill extends StatelessWidget {
  const _TagPill({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              fontFamily: 'monospace',
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _ChatBubble extends StatelessWidget {
  const _ChatBubble({
    required this.message,
    this.onCopy,
  });

  final _ChatMessage message;
  final VoidCallback? onCopy;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isUser = message.isUser;

    final Color bgColor;
    final Color borderColor;
    if (isUser) {
      bgColor = AppColors.amber.withValues(alpha: 0.16);
      borderColor = AppColors.amber.withValues(alpha: 0.45);
    } else if (message.isError) {
      bgColor = AppColors.rose.withValues(alpha: 0.12);
      borderColor = AppColors.rose.withValues(alpha: 0.45);
    } else {
      bgColor = theme.cardTheme.color ?? theme.colorScheme.surface;
      borderColor = theme.dividerColor;
    }

    final normalizedMarkdown =
        AiMarkdownHelper.normalizeAiMarkdownText(message.text);

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 540),
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: borderColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  isUser
                      ? Icons.person_outline
                      : message.isError
                      ? Icons.warning_amber_rounded
                      : Icons.auto_awesome,
                  size: 14,
                  color: isUser
                      ? AppColors.amber
                      : message.isError
                      ? AppColors.rose
                      : AppColors.cyanDark,
                ),
                const SizedBox(width: 6),
                Text(
                  isUser
                      ? 'Anda'
                      : message.isError
                      ? 'Peringatan Sistem'
                      : 'Smartsa AI',
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (isUser)
              SelectableText(message.text, style: theme.textTheme.bodyMedium)
            else
              MarkdownBody(
                data: normalizedMarkdown,
                selectable: true,
                onTapLink: (_, href, _) {
                  UrlUtils.launchSafeExternalUrl(href);
                },
                styleSheet: MarkdownStyleSheet.fromTheme(theme).copyWith(
                  p: theme.textTheme.bodyMedium?.copyWith(height: 1.45),
                  code: TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 12,
                    backgroundColor: theme.scaffoldBackgroundColor,
                  ),
                  codeblockDecoration: BoxDecoration(
                    color: theme.scaffoldBackgroundColor,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: theme.dividerColor),
                  ),
                ),
              ),
            if (message.note != null) ...[
              const SizedBox(height: 8),
              Text(
                message.note!,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontStyle: FontStyle.italic,
                  color: AppColors.amber,
                ),
              ),
            ],
            if (onCopy != null) ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: onCopy,
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                  icon: const Icon(Icons.copy_outlined, size: 14),
                  label: const Text('Salin', style: TextStyle(fontSize: 11)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _TypingIndicatorBubble extends StatelessWidget {
  const _TypingIndicatorBubble();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: theme.cardTheme.color,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: theme.dividerColor),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 10),
            Text('Memproses konteks pembelajaran...', style: TextStyle(fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
