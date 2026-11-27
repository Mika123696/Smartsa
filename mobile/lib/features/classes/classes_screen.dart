import 'package:flutter/material.dart';

import '../../core/models/lms_class.dart';
import '../../core/models/user_profile.dart';
import '../../core/services/api_client.dart';
import '../../core/theme/app_theme.dart';
import 'class_card.dart';
import 'join_class_dialog.dart';

/// Tab daftar kelas lengkap beserta pencarian lokal dan aksi Gabung Kelas.
class ClassesScreen extends StatefulWidget {
  const ClassesScreen({
    super.key,
    required this.profile,
    required this.apiClient,
    required this.classes,
    required this.pendingMemberships,
    required this.isLoading,
    required this.errorMessage,
    required this.onRefresh,
    required this.onOpenClass,
  });

  final UserProfile profile;
  final ApiClient apiClient;
  final List<LmsClass> classes;
  final List<ClassMembership> pendingMemberships;
  final bool isLoading;
  final String? errorMessage;
  final Future<void> Function() onRefresh;
  final ValueChanged<LmsClass> onOpenClass;

  @override
  State<ClassesScreen> createState() => _ClassesScreenState();
}

class _ClassesScreenState extends State<ClassesScreen> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _openJoinDialog() async {
    final outcome = await showJoinClassDialog(
      context: context,
      apiClient: widget.apiClient,
    );
    if (outcome == null || !mounted) return;
    await widget.onRefresh();
    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          outcome.pendingApproval
              ? 'Permintaan bergabung terkirim (Pending persetujuan dosen).'
              : 'Kelas berhasil ditambahkan ke daftar aktif Anda.',
        ),
        backgroundColor:
            outcome.pendingApproval ? AppColors.amberDark : AppColors.emerald,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final q = _query.trim().toLowerCase();
    final filtered = q.isEmpty
        ? widget.classes
        : widget.classes
            .where(
              (c) =>
                  c.displayTitle.toLowerCase().contains(q) ||
                  c.code.toLowerCase().contains(q) ||
                  c.instructor.toLowerCase().contains(q) ||
                  c.category.toLowerCase().contains(q),
            )
            .toList(growable: false);

    return RefreshIndicator(
      onRefresh: widget.onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _searchCtrl,
                  onChanged: (value) => setState(() => _query = value),
                  decoration: InputDecoration(
                    hintText: 'Cari nama kelas, kode, atau dosen...',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _query.isNotEmpty
                        ? IconButton(
                            onPressed: () {
                              _searchCtrl.clear();
                              setState(() => _query = '');
                            },
                            icon: const Icon(Icons.clear),
                          )
                        : null,
                  ),
                ),
              ),
              if (widget.profile.isStudent) ...[
                const SizedBox(width: 10),
                SizedBox(
                  height: 50,
                  child: ElevatedButton.icon(
                    onPressed: _openJoinDialog,
                    icon: const Icon(Icons.add),
                    label: const Text('Gabung'),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 16),
          if (widget.errorMessage != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  widget.errorMessage!,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.rose,
                  ),
                ),
              ),
            )
          else if (widget.isLoading && widget.classes.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (filtered.isEmpty && widget.pendingMemberships.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Icon(
                      Icons.class_outlined,
                      size: 40,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      q.isNotEmpty
                          ? 'Tidak ada kelas cocok dengan "$q"'
                          : 'Belum ada kelas aktif',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Tarik ke bawah untuk menyegarkan daftar kelas dari Cloud Firestore.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            )
          else ...[
            for (final item in filtered)
              ClassCard(
                lmsClass: item,
                onTap: () => widget.onOpenClass(item),
              ),
            if (widget.pendingMemberships.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                'Menunggu Persetujuan Dosen (${widget.pendingMemberships.length})',
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
