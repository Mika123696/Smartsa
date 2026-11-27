import 'package:flutter/material.dart';

import '../../../core/models/lms_class.dart';
import '../../../core/services/api_client.dart';
import '../../../core/services/firestore_service.dart';
import '../../../core/theme/app_theme.dart';

/// Tab manajemen anggota kelas (`pending` & `approved`/`active`) untuk Dosen & Admin.
class MembersTab extends StatefulWidget {
  const MembersTab({
    super.key,
    required this.lmsClass,
    required this.apiClient,
    required this.firestoreService,
    required this.onClassUpdated,
  });

  final LmsClass lmsClass;
  final ApiClient apiClient;
  final FirestoreService firestoreService;
  final Future<void> Function() onClassUpdated;

  @override
  State<MembersTab> createState() => _MembersTabState();
}

class _MembersTabState extends State<MembersTab> {
  final _searchCtrl = TextEditingController();
  List<ClassMembership> _members = const <ClassMembership>[];
  bool _loading = true;
  String? _busyMemberId;
  String? _errorMsg;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _loadMembers();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadMembers() async {
    setState(() {
      _loading = true;
      _errorMsg = null;
    });
    try {
      final list = await widget.firestoreService.fetchClassMembers(
        widget.lmsClass.id,
      );
      if (!mounted) return;
      setState(() => _members = list);
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMsg = 'Gagal memuat anggota kelas: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _decideMember(ClassMembership member, String action) async {
    if (action == 'remove') {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Keluarkan Anggota'),
          content: Text(
            'Keluarkan ${member.effectiveLabel} dari kelas ini?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Batal'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.rose,
                foregroundColor: Colors.white,
              ),
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Keluarkan'),
            ),
          ],
        ),
      );
      if (confirm != true || !mounted) return;
    }

    setState(() => _busyMemberId = member.id);
    try {
      await widget.apiClient.postManageMembers(
        action: action,
        classId: widget.lmsClass.id,
        memberUid: member.uid,
      );
      await Future.wait(<Future<void>>[
        _loadMembers(),
        widget.onClassUpdated(),
      ]);
      if (!mounted) return;
      final label = action == 'approve'
          ? 'Permintaan disetujui.'
          : action == 'reject'
          ? 'Permintaan ditolak.'
          : 'Anggota dikeluarkan.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${member.effectiveLabel}: $label')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Gagal memproses anggota: $e'),
          backgroundColor: AppColors.rose,
        ),
      );
    } finally {
      if (mounted) setState(() => _busyMemberId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pending = _members.where((m) => m.isPending).toList(growable: false);
    final active = _members.where((m) => m.isApproved).toList(growable: false);

    final cleanQ = _query.trim().toLowerCase();
    final filteredActive = cleanQ.isEmpty
        ? active
        : active
            .where(
              (m) =>
                  m.effectiveLabel.toLowerCase().contains(cleanQ) ||
                  m.email.toLowerCase().contains(cleanQ) ||
                  m.uid.toLowerCase().contains(cleanQ),
            )
            .toList(growable: false);

    return RefreshIndicator(
      onRefresh: _loadMembers,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_errorMsg != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  _errorMsg!,
                  style: const TextStyle(color: AppColors.rose),
                ),
              ),
            )
          else if (_loading && _members.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(child: CircularProgressIndicator()),
            )
          else ...[
            Text(
              'Permintaan Bergabung (${pending.length})',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.amber,
              ),
            ),
            const SizedBox(height: 8),
            if (pending.isEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Text(
                    'Tidak ada permintaan bergabung berstatus pending.',
                    style: theme.textTheme.bodySmall,
                  ),
                ),
              )
            else
              for (final m in pending)
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    title: Text(
                      m.effectiveLabel,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      '${m.email.isNotEmpty ? m.email : m.uid} • ${m.accountType}',
                    ),
                    trailing: _busyMemberId == m.id
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                tooltip: 'Setujui',
                                onPressed: () => _decideMember(m, 'approve'),
                                icon: const Icon(
                                  Icons.check_circle_outline,
                                  color: AppColors.emerald,
                                ),
                              ),
                              IconButton(
                                tooltip: 'Tolak',
                                onPressed: () => _decideMember(m, 'reject'),
                                icon: const Icon(
                                  Icons.cancel_outlined,
                                  color: AppColors.rose,
                                ),
                              ),
                            ],
                          ),
                  ),
                ),
            const SizedBox(height: 18),
            Text(
              'Anggota Aktif (${active.length})',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _searchCtrl,
              onChanged: (v) => setState(() => _query = v),
              decoration: const InputDecoration(
                hintText: 'Cari nama atau email anggota...',
                prefixIcon: Icon(Icons.search),
              ),
            ),
            const SizedBox(height: 10),
            if (filteredActive.isEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Text(
                    'Belum ada anggota aktif yang cocok.',
                    style: theme.textTheme.bodySmall,
                  ),
                ),
              )
            else
              for (final m in filteredActive)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(
                      m.effectiveLabel,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      '${m.email.isNotEmpty ? m.email : m.uid} • ${m.accountType}',
                    ),
                    trailing: _busyMemberId == m.id
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : IconButton(
                            tooltip: 'Keluarkan dari Kelas',
                            onPressed: () => _decideMember(m, 'remove'),
                            icon: const Icon(
                              Icons.person_remove_outlined,
                              color: AppColors.rose,
                            ),
                          ),
                  ),
                ),
          ],
        ],
      ),
    );
  }
}
