import 'package:flutter/material.dart';

import '../../../core/models/lms_class.dart';
import '../../../core/models/user_profile.dart';
import '../../../core/services/api_client.dart';
import '../../../core/services/cloudinary_upload_service.dart';
import '../../../core/services/firestore_service.dart';
import '../../../core/theme/app_theme.dart';
import 'tabs/assignments_tab.dart';
import 'tabs/attendance_tab.dart';
import 'tabs/discussion_tab.dart';
import 'tabs/exam_tab.dart';
import 'tabs/materials_video_tab.dart';
import 'tabs/members_tab.dart';

/// Halaman Detail Kelas lengkap (Materi & Video, Presensi, Tugas, Evaluasi, Diskusi, dan Anggota).
class ClassDetailScreen extends StatefulWidget {
  const ClassDetailScreen({
    super.key,
    required this.initialClass,
    required this.profile,
    required this.apiClient,
    required this.firestoreService,
    required this.cloudinaryUploadService,
    this.initialTabIndex = 0,
  });

  final LmsClass initialClass;
  final UserProfile profile;
  final ApiClient apiClient;
  final FirestoreService firestoreService;
  final CloudinaryUploadService cloudinaryUploadService;
  final int initialTabIndex;

  @override
  State<ClassDetailScreen> createState() => _ClassDetailScreenState();
}

class _ClassDetailScreenState extends State<ClassDetailScreen> {
  late LmsClass _classData;

  bool get _isEducatorOrAdmin =>
      widget.profile.isLecturer || widget.profile.isAdmin;

  @override
  void initState() {
    super.initState();
    _classData = widget.initialClass;
    _refreshClass();
  }

  Future<void> _refreshClass() async {
    try {
      final fresh = await widget.firestoreService.fetchClassById(_classData.id);
      if (fresh != null && mounted) {
        setState(() => _classData = fresh);
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final tabCount = _isEducatorOrAdmin ? 6 : 5;
    final initialIndex = widget.initialTabIndex.clamp(0, tabCount - 1);

    return DefaultTabController(
      length: tabCount,
      initialIndex: initialIndex,
      child: Scaffold(
        appBar: AppBar(
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _classData.displayTitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
              ),
              Text(
                '${_classData.code} • ${_classData.instructor} • ${_classData.enrolledCount} peserta',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: isDark ? AppColors.amber : AppColors.amberDark,
                ),
              ),
            ],
          ),
          actions: [
            IconButton(
              tooltip: 'Segarkan Kelas',
              onPressed: _refreshClass,
              icon: const Icon(Icons.refresh),
            ),
          ],
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            indicatorColor: AppColors.amber,
            labelColor: isDark ? AppColors.amber : AppColors.amberDark,
            tabs: [
              const Tab(icon: Icon(Icons.menu_book_outlined, size: 18), text: 'Materi & Video'),
              const Tab(icon: Icon(Icons.qr_code_scanner_outlined, size: 18), text: 'Presensi'),
              const Tab(icon: Icon(Icons.assignment_outlined, size: 18), text: 'Tugas'),
              const Tab(icon: Icon(Icons.quiz_outlined, size: 18), text: 'Evaluasi'),
              const Tab(icon: Icon(Icons.forum_outlined, size: 18), text: 'Diskusi'),
              if (_isEducatorOrAdmin)
                const Tab(icon: Icon(Icons.groups_outlined, size: 18), text: 'Anggota'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            MaterialsVideoTab(
              lmsClass: _classData,
              isEducatorOrAdmin: _isEducatorOrAdmin,
              firestoreService: widget.firestoreService,
              cloudinaryUploadService: widget.cloudinaryUploadService,
              onClassUpdated: _refreshClass,
            ),
            AttendanceTab(
              lmsClass: _classData,
              profile: widget.profile,
              firestoreService: widget.firestoreService,
            ),
            AssignmentsTab(
              lmsClass: _classData,
              profile: widget.profile,
              firestoreService: widget.firestoreService,
              cloudinaryUploadService: widget.cloudinaryUploadService,
            ),
            ExamTab(
              lmsClass: _classData,
              profile: widget.profile,
              apiClient: widget.apiClient,
              firestoreService: widget.firestoreService,
            ),
            DiscussionTab(
              lmsClass: _classData,
              profile: widget.profile,
              firestoreService: widget.firestoreService,
            ),
            if (_isEducatorOrAdmin)
              MembersTab(
                lmsClass: _classData,
                apiClient: widget.apiClient,
                firestoreService: widget.firestoreService,
                onClassUpdated: _refreshClass,
              ),
          ],
        ),
      ),
    );
  }
}
