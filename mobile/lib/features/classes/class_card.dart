import 'package:flutter/material.dart';

import '../../core/models/lms_class.dart';
import '../../core/theme/app_theme.dart';

/// Kartu informasi kelas untuk daftar kelas di Beranda & tab Kelas.
class ClassCard extends StatelessWidget {
  const ClassCard({
    super.key,
    required this.lmsClass,
    this.onTap,
  });

  final LmsClass lmsClass;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.amber.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: AppColors.amber.withValues(alpha: 0.4),
                      ),
                    ),
                    child: Text(
                      lmsClass.code.isEmpty ? lmsClass.id : lmsClass.code,
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: isDark ? AppColors.amber : AppColors.amberDark,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      lmsClass.category,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: isDark
                            ? AppColors.cyanDark
                            : AppColors.cyanLight,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: (lmsClass.isActive
                              ? AppColors.emerald
                              : AppColors.rose)
                          .withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      lmsClass.isActive ? 'Aktif' : 'Ditutup',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: lmsClass.isActive
                            ? AppColors.emerald
                            : AppColors.rose,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                lmsClass.displayTitle,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (lmsClass.description.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  lmsClass.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.72),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              Wrap(
                spacing: 14,
                runSpacing: 6,
                children: [
                  _MetaChip(
                    icon: Icons.person_outline,
                    label: lmsClass.instructor,
                  ),
                  _MetaChip(
                    icon: Icons.schedule_outlined,
                    label: lmsClass.scheduleLabel,
                  ),
                  _MetaChip(
                    icon: Icons.people_outline,
                    label: lmsClass.maxStudents > 0
                        ? '${lmsClass.enrolledCount}/${lmsClass.maxStudents} peserta'
                        : '${lmsClass.enrolledCount} peserta',
                  ),
                  _MetaChip(
                    icon: Icons.layers_outlined,
                    label: '${lmsClass.meetingsCount} pertemuan',
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final color =
        Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.68);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(fontSize: 11, color: color),
        ),
      ],
    );
  }
}

/// Kartu status keanggotaan kelas yang masih berstatus `pending`.
class PendingMembershipCard extends StatelessWidget {
  const PendingMembershipCard({super.key, required this.membership});

  final ClassMembership membership;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: AppColors.amber.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Icon(
            Icons.hourglass_top_rounded,
            color: AppColors.amber,
            size: 20,
          ),
        ),
        title: Text(
          'Kelas ${membership.classId}',
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        subtitle: const Text(
          'Keanggotaan akun umum menunggu persetujuan dosen/admin.',
        ),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: AppColors.amber.withValues(alpha: 0.16),
            borderRadius: BorderRadius.circular(6),
          ),
          child: const Text(
            'PENDING',
            style: TextStyle(
              fontFamily: 'monospace',
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: AppColors.amber,
            ),
          ),
        ),
      ),
    );
  }
}
