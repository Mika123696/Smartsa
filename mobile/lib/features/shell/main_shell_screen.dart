import 'package:flutter/material.dart';

import '../../core/models/lms_class.dart';
import '../../core/models/user_profile.dart';
import '../../core/services/api_client.dart';
import '../../core/services/cloudinary_upload_service.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/brand_logo.dart';
import '../ai/ai_tutor_screen.dart';
import '../attendance/quick_attendance_sheet.dart';
import '../auth/auth_controller.dart';
import '../classes/class_detail_screen.dart';
import '../classes/classes_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../manual_book/manual_book_screen.dart';
import '../profile/profile_screen.dart';

/// Kerangka navigasi utama aplikasi mobile dengan 5 tab responsif peran.
class MainShellScreen extends StatefulWidget {
  const MainShellScreen({
    super.key,
    required this.authController,
    required this.themeController,
    required this.apiClient,
    required this.firestoreService,
  });

  final AuthController authController;
  final ThemeController themeController;
  final ApiClient apiClient;
  final FirestoreService firestoreService;

  @override
  State<MainShellScreen> createState() => _MainShellScreenState();
}

class _MainShellScreenState extends State<MainShellScreen> {
  int _currentIndex = 0;
  List<LmsClass> _classes = const <LmsClass>[];
  List<ClassMembership> _pendingMemberships = const <ClassMembership>[];
  bool _isLoadingClasses = false;
  String? _classesError;
  String? _loadedForUid;
  late final CloudinaryUploadService _cloudinaryUploadService =
      CloudinaryUploadService(apiClient: widget.apiClient);

  UserProfile get _profile {
    final p = widget.authController.profile;
    if (p != null) return p;
    final user = widget.authController.currentUser;
    return UserProfile(
      uid: user?.uid ?? '',
      email: user?.email ?? '',
      name: user?.displayName ?? '',
      displayName: user?.displayName ?? '',
      photoUrl: user?.photoURL,
      role: 'student',
      accountType: 'UMUM',
      isInstitutional: false,
      emailVerified: user?.emailVerified ?? false,
      institution: 'Universitas Negeri Surabaya',
      nim: '',
      nidn: '',
      nip: '',
      mfaEnabled: false,
      mfaRequired: false,
    );
  }

  @override
  void initState() {
    super.initState();
    _loadClasses();
  }

  @override
  void didUpdateWidget(covariant MainShellScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_loadedForUid != _profile.uid) {
      _loadClasses();
    }
  }

  Future<void> _loadClasses() async {
    final profile = _profile;
    if (profile.uid.isEmpty) return;

    setState(() {
      _isLoadingClasses = true;
      _classesError = null;
      _loadedForUid = profile.uid;
    });

    try {
      final result = await widget.firestoreService.fetchClassesForUser(
        uid: profile.uid,
        role: profile.role,
      );
      if (!mounted) return;
      setState(() {
        _classes = result.classes;
        _pendingMemberships = result.pendingMemberships;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _classesError = e.toString();
      });
    } finally {
      if (mounted) {
        setState(() => _isLoadingClasses = false);
      }
    }
  }

  Future<void> _openClassDetail(LmsClass cls) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ClassDetailScreen(
          initialClass: cls,
          profile: _profile,
          apiClient: widget.apiClient,
          firestoreService: widget.firestoreService,
          cloudinaryUploadService: _cloudinaryUploadService,
        ),
      ),
    );
    if (mounted) {
      await _loadClasses();
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = _profile;
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final pages = <Widget>[
      DashboardScreen(
        profile: profile,
        apiClient: widget.apiClient,
        classes: _classes,
        pendingMemberships: _pendingMemberships,
        isLoadingClasses: _isLoadingClasses,
        classesError: _classesError,
        onRefreshClasses: _loadClasses,
        onOpenClassesTab: () => setState(() => _currentIndex = 1),
        onOpenClass: _openClassDetail,
        onQuickAttendance: () => showQuickAttendanceSheet(
          context: context,
          profile: profile,
          classes: _classes,
          firestoreService: widget.firestoreService,
          onSuccess: _loadClasses,
        ),
      ),
      ClassesScreen(
        profile: profile,
        apiClient: widget.apiClient,
        classes: _classes,
        pendingMemberships: _pendingMemberships,
        isLoading: _isLoadingClasses,
        errorMessage: _classesError,
        onRefresh: _loadClasses,
        onOpenClass: _openClassDetail,
      ),
      AiTutorScreen(
        profile: profile,
        classes: _classes,
        apiClient: widget.apiClient,
        firestoreService: widget.firestoreService,
      ),
      ManualBookScreen(
        profile: profile,
        firestoreService: widget.firestoreService,
        cloudinaryUploadService: _cloudinaryUploadService,
      ),
      ProfileScreen(
        profile: profile,
        authController: widget.authController,
        themeController: widget.themeController,
        apiClient: widget.apiClient,
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const BrandLogo(size: 24, glow: false),
            const SizedBox(width: 10),
            const Text(
              'Smartsa LMS',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
            ),
          ],
        ),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 14),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.amber.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: AppColors.amber.withValues(alpha: 0.45),
              ),
            ),
            child: Text(
              profile.roleLabel.toUpperCase(),
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 10,
                fontWeight: FontWeight.w800,
                color: isDark ? AppColors.amber : AppColors.amberDark,
              ),
            ),
          ),
        ],
      ),
      body: IndexedStack(
        index: _currentIndex,
        children: pages,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (idx) => setState(() => _currentIndex = idx),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Beranda',
          ),
          NavigationDestination(
            icon: const Icon(Icons.class_outlined),
            selectedIcon: const Icon(Icons.class_),
            label: profile.isAdmin
                ? 'Semua Kelas'
                : profile.isLecturer
                ? 'Kelas Ajar'
                : 'Kelas',
          ),
          const NavigationDestination(
            icon: Icon(Icons.auto_awesome_outlined),
            selectedIcon: Icon(Icons.auto_awesome),
            label: 'AI Tutor',
          ),
          const NavigationDestination(
            icon: Icon(Icons.menu_book_outlined),
            selectedIcon: Icon(Icons.menu_book),
            label: 'Manual Book',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profil',
          ),
        ],
      ),
    );
  }
}
