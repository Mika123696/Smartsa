import 'package:flutter/material.dart';

import '../../../core/models/lms_class.dart';
import '../../../core/services/cloudinary_upload_service.dart';
import '../../../core/services/firestore_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/picked_file_helper.dart';
import '../../../core/utils/url_utils.dart';

/// Tab Materi & Video pada [ClassDetailScreen].
class MaterialsVideoTab extends StatefulWidget {
  const MaterialsVideoTab({
    super.key,
    required this.lmsClass,
    required this.isEducatorOrAdmin,
    required this.firestoreService,
    required this.cloudinaryUploadService,
    required this.onClassUpdated,
  });

  final LmsClass lmsClass;
  final bool isEducatorOrAdmin;
  final FirestoreService firestoreService;
  final CloudinaryUploadService cloudinaryUploadService;
  final Future<void> Function() onClassUpdated;

  @override
  State<MaterialsVideoTab> createState() => _MaterialsVideoTabState();
}

class _MaterialsVideoTabState extends State<MaterialsVideoTab> {
  bool _saving = false;

  Future<void> _openSafeUrl(String url) async {
    final ok = await UrlUtils.launchSafeExternalUrl(url);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Tautan tidak valid atau tidak dapat dibuka.'),
          backgroundColor: AppColors.rose,
        ),
      );
    }
  }

  Future<void> _uploadMaterialToMeeting(ClassMeeting meeting) async {
    final PickedUploadFile? picked;
    try {
      picked = await pickAndValidateUploadFile(
        category: 'document',
        allowedExtensions: const <String>[
          'pdf',
          'pptx',
          'ppt',
          'docx',
          'doc',
          'zip',
          'fig',
          'jpg',
          'jpeg',
          'png',
          'webp',
        ],
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: AppColors.rose),
        );
      }
      return;
    }
    if (picked == null || !mounted) return;
    final selected = picked;

    final titleCtrl = TextEditingController(
      text: selected.name
          .replaceAll(RegExp(r'\.[^.]+$'), '')
          .replaceAll(RegExp(r'[_-]+'), ' ')
          .trim(),
    );

    final confirmedTitle = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Tambah Materi — Pertemuan ${meeting.order}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Berkas: ${selected.name} (${selected.sizeLabel})',
              style: Theme.of(ctx).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: titleCtrl,
              decoration: const InputDecoration(labelText: 'Judul Materi'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () {
              final clean = titleCtrl.text.trim();
              if (clean.isNotEmpty) Navigator.of(ctx).pop(clean);
            },
            child: const Text('Unggah & Simpan'),
          ),
        ],
      ),
    );
    titleCtrl.dispose();

    if (confirmedTitle == null || !mounted) return;

    setState(() => _saving = true);
    try {
      final uploadRes = await widget.cloudinaryUploadService.uploadFile(
        category: 'document',
        fileName: picked.name,
        fileSize: picked.fileSize,
        bytes: picked.bytes,
        filePath: picked.filePath,
      );

      final newEntry = MaterialFileItem(
        id: 'mat_${DateTime.now().millisecondsSinceEpoch}',
        title: confirmedTitle,
        description: '',
        fileUrl: uploadRes.url,
        fileName: uploadRes.fileName,
        fileType: uploadRes.fileType,
        mimeType: uploadRes.mimeType,
        fileSize: uploadRes.fileSizeLabel,
        storageType: 'cloudinary',
        uploadedAt: DateTime.now().toIso8601String(),
      );

      final updatedMeetings = _buildUpdatedMeetings(
        targetOrder: meeting.order,
        transformFiles: (existing) => <Map<String, dynamic>>[
          ...existing.map((e) => e.toMap()),
          newEntry.toMap(),
        ],
      );

      await widget.firestoreService.updateClassMeetings(
        classId: widget.lmsClass.id,
        rawMeetings: updatedMeetings,
      );
      await widget.onClassUpdated();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Materi "$confirmedTitle" ditambahkan ke Pertemuan ${meeting.order}.'),
          backgroundColor: AppColors.emerald,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Gagal mengunggah materi: $e'),
          backgroundColor: AppColors.rose,
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _deleteMaterialFile(
    ClassMeeting meeting,
    MaterialFileItem fileItem,
  ) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Hapus Materi Pertemuan'),
        content: Text('Hapus berkas "${fileItem.displayName}" dari pertemuan ini?'),
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
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;

    setState(() => _saving = true);
    try {
      final updatedMeetings = _buildUpdatedMeetings(
        targetOrder: meeting.order,
        transformFiles: (existing) => existing
            .where((f) => f.id != fileItem.id)
            .map((f) => f.toMap())
            .toList(growable: false),
      );

      await widget.firestoreService.updateClassMeetings(
        classId: widget.lmsClass.id,
        rawMeetings: updatedMeetings,
      );
      await widget.onClassUpdated();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Gagal menghapus materi: $e'),
          backgroundColor: AppColors.rose,
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  List<Map<String, dynamic>> _buildUpdatedMeetings({
    required int targetOrder,
    required List<Map<String, dynamic>> Function(List<MaterialFileItem>)
        transformFiles,
  }) {
    return widget.lmsClass.meetings.map((m) {
      final copy = Map<String, dynamic>.from(m.rawMap);
      if (m.order == targetOrder) {
        copy['materialFiles'] = transformFiles(m.materialFiles);
      }
      return copy;
    }).toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final meetings = widget.lmsClass.meetings;

    if (meetings.isEmpty) {
      return RefreshIndicator(
        onRefresh: widget.onClassUpdated,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Icon(
                      Icons.layers_clear_outlined,
                      size: 40,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Belum ada pertemuan terjadwal',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Materi berkas dan video pertemuan yang disiapkan dosen akan muncul di sini.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Stack(
      children: [
        RefreshIndicator(
          onRefresh: widget.onClassUpdated,
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: meetings.length,
            itemBuilder: (context, idx) {
              final meeting = meetings[idx];
              final videos = meeting.playableVideoUrls;

              return Card(
                margin: const EdgeInsets.only(bottom: 14),
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
                              color: AppColors.amber.withValues(alpha: 0.16),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              'PERTEMUAN ${meeting.order}',
                              style: TextStyle(
                                fontFamily: 'monospace',
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: isDark
                                    ? AppColors.amber
                                    : AppColors.amberDark,
                              ),
                            ),
                          ),
                          const Spacer(),
                          if (widget.isEducatorOrAdmin)
                            TextButton.icon(
                              onPressed: _saving
                                  ? null
                                  : () => _uploadMaterialToMeeting(meeting),
                              icon: const Icon(Icons.upload_file, size: 16),
                              label: const Text(
                                'Tambah File',
                                style: TextStyle(fontSize: 12),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        meeting.title,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      if (meeting.description.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(meeting.description, style: theme.textTheme.bodySmall),
                      ],
                      if (meeting.materialFiles.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text(
                          'Berkas Materi (${meeting.materialFiles.length})',
                          style: theme.textTheme.labelMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        for (final file in meeting.materialFiles)
                          Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: theme.scaffoldBackgroundColor,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: theme.dividerColor),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 3,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppColors.amber.withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(5),
                                  ),
                                  child: Text(
                                    file.fileType.toUpperCase(),
                                    style: const TextStyle(
                                      fontFamily: 'monospace',
                                      fontSize: 9,
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.amber,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        file.displayName,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 12,
                                        ),
                                      ),
                                      if (file.fileSize.isNotEmpty)
                                        Text(
                                          file.fileSize,
                                          style: theme.textTheme.labelSmall,
                                        ),
                                    ],
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Buka / Unduh Berkas',
                                  onPressed: () => _openSafeUrl(file.fileUrl),
                                  icon: const Icon(Icons.open_in_new, size: 18),
                                ),
                                if (widget.isEducatorOrAdmin)
                                  IconButton(
                                    tooltip: 'Hapus Materi',
                                    onPressed: _saving
                                        ? null
                                        : () => _deleteMaterialFile(meeting, file),
                                    icon: const Icon(
                                      Icons.delete_outline,
                                      size: 18,
                                      color: AppColors.rose,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                      ],
                      if (meeting.hasDeltaContent) ...[
                        const SizedBox(height: 10),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: theme.scaffoldBackgroundColor,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: theme.dividerColor),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Catatan / Ringkasan Modul (Baca-Saja)',
                                style: theme.textTheme.labelSmall?.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.amber,
                                ),
                              ),
                              const SizedBox(height: 6),
                              SelectableText(
                                meeting.deltaPlainText,
                                style: theme.textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                      ],
                      if (videos.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        for (var vIdx = 0; vIdx < videos.length; vIdx++)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: OutlinedButton.icon(
                              onPressed: () => _openSafeUrl(videos[vIdx]),
                              icon: const Icon(
                                Icons.play_circle_outline,
                                color: AppColors.rose,
                              ),
                              label: Text(
                                videos.length == 1
                                    ? 'Tonton Video Pembelajaran'
                                    : 'Tonton Video ${vIdx + 1}',
                              ),
                            ),
                          ),
                      ],
                      if (meeting.materialFiles.isEmpty &&
                          !meeting.hasDeltaContent &&
                          videos.isEmpty) ...[
                        const SizedBox(height: 8),
                        Text(
                          'Belum ada berkas materi atau video pada pertemuan ini.',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.6),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        if (_saving)
          const Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: LinearProgressIndicator(),
          ),
      ],
    );
  }
}
