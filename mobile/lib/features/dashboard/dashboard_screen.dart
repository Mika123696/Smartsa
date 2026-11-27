import 'package:flutter/material.dart';

import '../../core/models/lms_class.dart';
import '../../core/models/user_profile.dart';
import '../../core/services/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../classes/class_card.dart';
import '../classes/join_class_dialog.dart';

/// Layar Beranda / Dashboard ringkasan profil, kesehatan layanan (Admin),
/// aksi gabung kelas, dan daftar kelas aktual Firestore.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({
    super.key,
    required this.profile,
    required this.apiClient,
    required this.classes,
    required this.pendingMemberships,
    required this.isLoadingClasses,
    required this.classesError,
    required this.onRefreshClasses,
    required this.onOpenClassesTab,
    required this.onOpenClass,
    this.onQuickAttendance,
  });

  final UserProfile profile;
  final ApiClient apiClient;
  final List<LmsClass> classes;
  final List<ClassMembership> pendingMemberships;
  final bool isLoadingClasses;
  final String? classesError;
  final Future<void> Function() onRefreshClasses;
  final VoidCallback onOpenClassesTab;
  final ValueChanged<LmsClass> onOpenClass;
  final VoidCallback? onQuickAttendance;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  ServerHealthStatus? _healthStatus;
  String? _healthError;
  bool _loadingHealth = false;

  @override
  void initState() {
    super.initState();
    if (widget.profile.isAdmin) {
      _loadHealth();
    }
  }

  @override
  void didUpdateWidget(covariant DashboardScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!oldWidget.profile.isAdmin && widget.profile.isAdmin) {
      _loadHealth();
    }
  }

  Future<void> _loadHealth() async {
    if (!widget.profile.isAdmin) return;
    setState(() {
      _loadingHealth = true;
      _healthError = null;
    });
    try {
      final raw = await widget.apiClient.getHealth();
      if (!mounted) return;
      setState(() {
        _healthStatus = ServerHealthStatus.fromJson(raw);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _healthError = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _healthError = 'Gagal memuat status kesehatan backend: $e';
      });
    } finally {
      if (mounted) {
        setState(() => _loadingHealth = false);
      }
    }
  }

  Future<void> _handleJoinClass() async {
    final outcome = await showJoinClassDialog(
      context: context,
      apiClient: widget.apiClient,
    );
    if (outcome == null || !mounted) return;

    await widget.onRefreshClasses();
    if (!mounted) return;

    final String message;
    if (outcome.alreadyMember && outcome.pendingApproval) {
      message = 'Permintaan keanggotaan Anda masih menunggu persetujuan dosen.';
    } else if (outcome.alreadyMember) {
      message = 'Anda sudah terdaftar aktif di kelas ini.';
    } else if (outcome.pendingApproval) {
      message =
          'Permintaan bergabung dikirim (Status: Pending Persetujuan Dosen).';
    } else {
      message = 'Berhasil bergabung ke kelas (Status: Disetujui).';
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor:
            outcome.pendingApproval ? AppColors.amberDark : AppColors.emerald,
      ),
    );
  }

  Future<void> _handleRefreshAll() async {
    await Future.wait(<Future<void>>[
      widget.onRefreshClasses(),
      if (widget.profile.isAdmin) _loadHealth(),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final profile = widget.profile;

    return RefreshIndicator(
      onRefresh: _handleRefreshAll,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Kartu Ringkasan Profil & Status Akun
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 24,
                        backgroundColor:
                            AppColors.amber.withValues(alpha: 0.18),
                        child: Text(
                          profile.effectiveName.isNotEmpty
                              ? profile.effectiveName[0].toUpperCase()
                              : 'S',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            color: isDark
                                ? AppColors.amber
                                : AppColors.amberDark,
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              profile.effectiveName,
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              profile.email.isEmpty
                                  ? profile.uid
                                  : profile.email,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodySmall?.copyWith(
                                fontFamily: 'monospace',
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.7),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _StatusBadge(
                        label: profile.roleLabel.toUpperCase(),
                        color: AppColors.amber,
                      ),
                      _StatusBadge(
                        label: profile.isInstitutional
                            ? 'INSTITUSIONAL'
                            : 'UMUM',
                        color: profile.isInstitutional
                            ? AppColors.emerald
                            : (isDark
                                ? AppColors.cyanDark
                                : AppColors.cyanLight),
                      ),
                      _StatusBadge(
                        label: profile.mfaEnabled ? '2FA AKTIF' : '2FA NONAKTIF',
                        color: profile.mfaEnabled
                            ? AppColors.emerald
                            : theme.colorScheme.onSurface
                                .withValues(alpha: 0.45),
                      ),
                    ],
                  ),
                  if (profile.isStudent) ...[
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _handleJoinClass,
                        icon: const Icon(Icons.add_circle_outline),
                        label: const Text('Gabung Kelas dengan Kode'),
                      ),
                    ),
                    if (widget.onQuickAttendance != null) ...[
                      const SizedBox(height: 8),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: widget.onQuickAttendance,
                          icon: const Icon(Icons.qr_code_scanner),
                          label: const Text('Presensi Cepat / Scan QR'),
                        ),
                      ),
                    ],
                  ],
                ],
              ),
            ),
          ),

          // Panel Kesehatan Layanan Backend Khusus Admin
          if (profile.isAdmin) ...[
            const SizedBox(height: 14),
            _AdminHealthCard(
              healthStatus: _healthStatus,
              error: _healthError,
              isLoading: _loadingHealth,
              onRefresh: _loadHealth,
            ),
          ],

          const SizedBox(height: 18),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                profile.isAdmin
                    ? 'Seluruh Kelas (${widget.classes.length})'
                    : profile.isLecturer
                    ? 'Kelas yang Diampu (${widget.classes.length})'
                    : 'Kelas Saya (${widget.classes.length})',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              TextButton(
                onPressed: widget.onOpenClassesTab,
                child: const Text('Lihat Semua'),
              ),
            ],
          ),
          const SizedBox(height: 8),

          if (widget.classesError != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  'Gagal memuat kelas dari Firestore: ${widget.classesError}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.rose,
                  ),
                ),
              ),
            )
          else if (widget.isLoadingClasses && widget.classes.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 28),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (widget.classes.isEmpty && widget.pendingMemberships.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    Icon(
                      Icons.school_outlined,
                      size: 38,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Belum ada kelas terdaftar',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      profile.isStudent
                          ? 'Gunakan tombol "Gabung Kelas dengan Kode" di atas untuk mendaftar ke kelas.'
                          : 'Kelas yang Anda buat atau kelola di Smartsa akan muncul di sini.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            )
          else ...[
            for (final item in widget.classes.take(5))
              ClassCard(
                lmsClass: item,
                onTap: () => widget.onOpenClass(item),
              ),
            if (widget.pendingMemberships.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Menunggu Persetujuan (${widget.pendingMemberships.length})',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              for (final pending in widget.pendingMemberships)
                PendingMembershipCard(membership: pending),
            ],
          ],
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.label, required this.color});

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

class _AdminHealthCard extends StatelessWidget {
  const _AdminHealthCard({
    required this.healthStatus,
    required this.error,
    required this.isLoading,
    required this.onRefresh,
  });

  final ServerHealthStatus? healthStatus;
  final String? error;
  final bool isLoading;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.monitor_heart_outlined,
                  size: 18,
                  color: isDark ? AppColors.cyanDark : AppColors.cyanLight,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'KESIHAPAN BACKEND (/api/health)',
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w800,
                      color: isDark ? AppColors.cyanDark : AppColors.cyanLight,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: isLoading ? null : onRefresh,
                  tooltip: 'Segarkan Health',
                  icon: isLoading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.refresh, size: 18),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (error != null)
              Text(
                error!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.rose,
                ),
              )
            else if (healthStatus == null)
              Text(
                'Memeriksa layanan server...',
                style: theme.textTheme.bodySmall,
              )
            else
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _StatusBadge(
                    label:
                        'FIRESTORE: ${healthStatus!.firestore ? 'OK' : 'OFF'}',
                    color: healthStatus!.firestore
                        ? AppColors.emerald
                        : AppColors.rose,
                  ),
                  _StatusBadge(
                    label:
                        'CLOUDINARY: ${healthStatus!.cloudinaryConfigured ? 'SIAP' : 'BELUM'}',
                    color: healthStatus!.cloudinaryConfigured
                        ? AppColors.emerald
                        : AppColors.amber,
                  ),
                  _StatusBadge(
                    label:
                        'GEMINI: ${healthStatus!.geminiConfigured ? healthStatus!.geminiModel : 'FROZEN'}',
                    color: healthStatus!.geminiConfigured
                        ? AppColors.emerald
                        : AppColors.amber,
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
