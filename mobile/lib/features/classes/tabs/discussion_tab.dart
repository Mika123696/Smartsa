import 'package:flutter/material.dart';

import '../../../core/models/discussion_models.dart';
import '../../../core/models/lms_class.dart';
import '../../../core/models/user_profile.dart';
import '../../../core/services/firestore_service.dart';
import '../../../core/theme/app_theme.dart';

/// Tab Diskusi kelas per pertemuan berbasis transaksi Firestore.
class DiscussionTab extends StatefulWidget {
  const DiscussionTab({
    super.key,
    required this.lmsClass,
    required this.profile,
    required this.firestoreService,
  });

  final LmsClass lmsClass;
  final UserProfile profile;
  final FirestoreService firestoreService;

  @override
  State<DiscussionTab> createState() => _DiscussionTabState();
}

class _DiscussionTabState extends State<DiscussionTab> {
  final _topicCtrl = TextEditingController();
  int? _filterMeetingNo;
  int _postMeetingNo = 1;
  bool _posting = false;

  @override
  void initState() {
    super.initState();
    if (widget.lmsClass.meetings.isNotEmpty) {
      _postMeetingNo = widget.lmsClass.meetings.first.order;
    }
  }

  @override
  void dispose() {
    _topicCtrl.dispose();
    super.dispose();
  }

  Future<void> _createTopic() async {
    final text = _topicCtrl.text.trim();
    if (text.isEmpty || _posting) return;

    setState(() => _posting = true);
    try {
      await widget.firestoreService.createDiscussionTopic(
        classId: widget.lmsClass.id,
        meetingNo: _postMeetingNo,
        subject: widget.lmsClass.displayTitle,
        content: text,
        authorUid: widget.profile.uid,
        authorName: widget.profile.effectiveName,
      );
      if (!mounted) return;
      _topicCtrl.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Topik diskusi berhasil dikirim.'),
          backgroundColor: AppColors.emerald,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Gagal mengirim topik: $e'),
          backgroundColor: AppColors.rose,
        ),
      );
    } finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  Future<void> _toggleLike(DiscussionTopic topic) async {
    try {
      await widget.firestoreService.toggleDiscussionLike(
        discussionId: topic.id,
        uid: widget.profile.uid,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Gagal memperbarui suka: $e'),
          backgroundColor: AppColors.rose,
        ),
      );
    }
  }

  Future<void> _openDetailAndReply(DiscussionTopic initialTopic) async {
    final replyCtrl = TextEditingController();
    bool sending = false;
    String? errText;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom,
        ),
        child: StreamBuilder<List<DiscussionTopic>>(
          stream: widget.firestoreService.watchClassDiscussions(widget.lmsClass.id),
          builder: (ctx, snap) {
            final liveTopic = (snap.data ?? const <DiscussionTopic>[])
                    .where((d) => d.id == initialTopic.id)
                    .firstOrNull ??
                initialTopic;

            return StatefulBuilder(
              builder: (ctx, setSheetState) => DraggableScrollableSheet(
                expand: false,
                initialChildSize: 0.72,
                minChildSize: 0.45,
                maxChildSize: 0.94,
                builder: (_, scrollCtrl) => Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              'Diskusi P${liveTopic.meetingNo} • ${liveTopic.author}',
                              style: const TextStyle(fontWeight: FontWeight.w800),
                            ),
                          ),
                          IconButton(
                            onPressed: () => Navigator.of(ctx).pop(),
                            icon: const Icon(Icons.close),
                          ),
                        ],
                      ),
                    ),
                    const Divider(height: 1),
                    Expanded(
                      child: ListView(
                        controller: scrollCtrl,
                        padding: const EdgeInsets.all(16),
                        children: [
                          Text(liveTopic.content),
                          const SizedBox(height: 14),
                          Text(
                            'Balasan (${liveTopic.replies.length})',
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 8),
                          if (liveTopic.replies.isEmpty)
                            const Text(
                              'Belum ada balasan. Jadilah yang pertama membalas!',
                              style: TextStyle(fontSize: 12),
                            )
                          else
                            for (final rep in liveTopic.replies)
                              Card(
                                margin: const EdgeInsets.only(bottom: 8),
                                child: Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text(
                                              rep.author,
                                              style: const TextStyle(
                                                fontWeight: FontWeight.w700,
                                                fontSize: 12,
                                              ),
                                            ),
                                          ),
                                          Text(
                                            rep.time,
                                            style: const TextStyle(fontSize: 10),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 4),
                                      Text(rep.content),
                                    ],
                                  ),
                                ),
                              ),
                        ],
                      ),
                    ),
                    if (errText != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Text(
                          errText!,
                          style: const TextStyle(
                            color: AppColors.rose,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: replyCtrl,
                              enabled: !sending,
                              decoration: const InputDecoration(
                                hintText: 'Tulis balasan diskusi...',
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton(
                            onPressed: sending
                                ? null
                                : () async {
                                    final text = replyCtrl.text.trim();
                                    if (text.isEmpty) return;
                                    setSheetState(() {
                                      sending = true;
                                      errText = null;
                                    });
                                    try {
                                      await widget.firestoreService
                                          .addDiscussionReply(
                                        discussionId: liveTopic.id,
                                        uid: widget.profile.uid,
                                        authorName:
                                            widget.profile.effectiveName,
                                        content: text,
                                      );
                                      replyCtrl.clear();
                                    } catch (e) {
                                      errText = e.toString();
                                    } finally {
                                      if (ctx.mounted) {
                                        setSheetState(() => sending = false);
                                      }
                                    }
                                  },
                            child: sending
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.black,
                                    ),
                                  )
                                : const Icon(Icons.send_rounded, size: 18),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );

    replyCtrl.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final meetingNumbers = widget.lmsClass.meetings.isNotEmpty
        ? widget.lmsClass.meetings.map((m) => m.order).toList()
        : List<int>.generate(16, (i) => i + 1);
    if (!meetingNumbers.contains(_postMeetingNo)) {
      _postMeetingNo = meetingNumbers.first;
    }

    return Column(
      children: [
        // Composer + Filter Pertemuan
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<int?>(
                      initialValue: _filterMeetingNo,
                      decoration: const InputDecoration(
                        labelText: 'Filter Pertemuan',
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                      ),
                      items: <DropdownMenuItem<int?>>[
                        const DropdownMenuItem<int?>(
                          value: null,
                          child: Text('Semua Pertemuan'),
                        ),
                        ...meetingNumbers.map(
                          (n) => DropdownMenuItem<int?>(
                            value: n,
                            child: Text('Pertemuan $n'),
                          ),
                        ),
                      ],
                      onChanged: (v) => setState(() => _filterMeetingNo = v),
                    ),
                  ),
                  const SizedBox(width: 10),
                  SizedBox(
                    width: 130,
                    child: DropdownButtonFormField<int>(
                      initialValue: _postMeetingNo,
                      decoration: const InputDecoration(
                        labelText: 'Untuk P',
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                      ),
                      items: meetingNumbers
                          .map(
                            (n) => DropdownMenuItem<int>(
                              value: n,
                              child: Text('P$n'),
                            ),
                          )
                          .toList(),
                      onChanged: (v) {
                        if (v != null) setState(() => _postMeetingNo = v);
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _topicCtrl,
                      enabled: !_posting,
                      decoration: const InputDecoration(
                        hintText: 'Buat pertanyaan atau topik diskusi baru...',
                      ),
                      onSubmitted: (_) => _createTopic(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _posting ? null : _createTopic,
                      child: _posting
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.black,
                              ),
                            )
                          : const Icon(Icons.send_rounded, size: 18),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: StreamBuilder<List<DiscussionTopic>>(
            stream: widget.firestoreService
                .watchClassDiscussions(widget.lmsClass.id),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting &&
                  !snapshot.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      'Gagal memuat diskusi: ${snapshot.error}',
                      style: const TextStyle(color: AppColors.rose),
                    ),
                  ),
                );
              }

              final allTopics = snapshot.data ?? const <DiscussionTopic>[];
              final filtered = _filterMeetingNo == null
                  ? allTopics
                  : allTopics
                      .where((t) => t.meetingNo == _filterMeetingNo)
                      .toList(growable: false);

              if (filtered.isEmpty) {
                return Center(
                  child: Text(
                    'Belum ada topik diskusi pada filter pertemuan ini.',
                    style: theme.textTheme.bodySmall,
                  ),
                );
              }

              return ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: filtered.length,
                itemBuilder: (context, idx) {
                  final topic = filtered[idx];
                  final liked = topic.isLikedBy(widget.profile.uid);
                  return Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  topic.author,
                                  style: theme.textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 7,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.amber.withValues(alpha: 0.14),
                                  borderRadius: BorderRadius.circular(5),
                                ),
                                child: Text(
                                  'P${topic.meetingNo}',
                                  style: const TextStyle(
                                    fontFamily: 'monospace',
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.amber,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          Text(topic.timeLabel, style: theme.textTheme.labelSmall),
                          const SizedBox(height: 8),
                          Text(topic.content),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              TextButton.icon(
                                onPressed: () => _toggleLike(topic),
                                icon: Icon(
                                  liked
                                      ? Icons.thumb_up
                                      : Icons.thumb_up_outlined,
                                  size: 16,
                                  color: liked ? AppColors.amber : null,
                                ),
                                label: Text('${topic.likes}'),
                              ),
                              const SizedBox(width: 6),
                              TextButton.icon(
                                onPressed: () => _openDetailAndReply(topic),
                                icon: const Icon(
                                  Icons.chat_bubble_outline,
                                  size: 16,
                                ),
                                label: Text('${topic.replies.length} Balasan'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}
