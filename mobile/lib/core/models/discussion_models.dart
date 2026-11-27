import 'package:cloud_firestore/cloud_firestore.dart';

/// Balasan diskusi di dalam array `discussions/{id}.replies[]`.
class DiscussionReply {
  const DiscussionReply({
    required this.id,
    required this.authorUid,
    required this.author,
    required this.time,
    required this.content,
  });

  final String id;
  final String authorUid;
  final String author;
  final String time;
  final String content;

  Map<String, dynamic> toMap() {
    return <String, dynamic>{
      'id': id,
      'authorUid': authorUid,
      'author': author,
      'time': time,
      'content': content,
    };
  }

  factory DiscussionReply.fromMap(Map<String, dynamic> map) {
    return DiscussionReply(
      id: (map['id'] ?? '').toString().trim(),
      authorUid: (map['authorUid'] ?? '').toString().trim(),
      author: (map['author'] ?? 'Pengguna Smartsa').toString().trim(),
      time: (map['time'] ?? 'Baru saja').toString().trim(),
      content: (map['content'] ?? '').toString().trim(),
    );
  }
}

/// Topik diskusi pada koleksi `discussions/{discussionId}`.
class DiscussionTopic {
  const DiscussionTopic({
    required this.id,
    required this.classId,
    required this.meetingNo,
    required this.subject,
    required this.authorUid,
    required this.author,
    required this.content,
    required this.likes,
    required this.likedBy,
    required this.replies,
    required this.isVerifiedAnswer,
    required this.timeLabel,
    this.sortMs = 0,
  });

  final String id;
  final String classId;
  final int meetingNo;
  final String subject;
  final String authorUid;
  final String author;
  final String content;
  final int likes;
  final List<String> likedBy;
  final List<DiscussionReply> replies;
  final bool isVerifiedAnswer;
  final String timeLabel;
  final int sortMs;

  bool isLikedBy(String uid) => likedBy.contains(uid);

  factory DiscussionTopic.fromMap(String id, Map<String, dynamic> map) {
    final rawMeeting = map['meetingNo'];
    final parsedMeeting = rawMeeting is num
        ? rawMeeting.toInt()
        : int.tryParse(rawMeeting?.toString() ?? '') ?? 1;

    final rawLikedBy = map['likedBy'];
    final parsedLikedBy = rawLikedBy is List
        ? rawLikedBy.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList(growable: false)
        : const <String>[];

    final rawReplies = map['replies'];
    final parsedReplies = rawReplies is List
        ? rawReplies
            .whereType<Map>()
            .map((e) => DiscussionReply.fromMap(Map<String, dynamic>.from(e)))
            .toList(growable: false)
        : const <DiscussionReply>[];

    return DiscussionTopic(
      id: id,
      classId: (map['classId'] ?? '').toString().trim(),
      meetingNo: parsedMeeting.clamp(1, 32),
      subject: (map['subject'] ?? 'Forum Diskusi').toString().trim(),
      authorUid: (map['authorUid'] ?? '').toString().trim(),
      author: (map['author'] ?? 'Pengguna Smartsa').toString().trim(),
      content: (map['content'] ?? '').toString().trim(),
      likes: map['likes'] is num ? (map['likes'] as num).toInt() : parsedLikedBy.length,
      likedBy: parsedLikedBy,
      replies: parsedReplies,
      isVerifiedAnswer: map['isVerifiedAnswer'] == true,
      timeLabel: (map['timeLabel'] ?? 'Baru saja').toString().trim(),
      sortMs: _toMillis(map['createdAt'] ?? map['updatedAt']),
    );
  }

  static int _toMillis(dynamic value) {
    if (value is Timestamp) return value.millisecondsSinceEpoch;
    if (value is num) return value.toInt();
    if (value is String) {
      return DateTime.tryParse(value)?.millisecondsSinceEpoch ?? 0;
    }
    return 0;
  }
}
