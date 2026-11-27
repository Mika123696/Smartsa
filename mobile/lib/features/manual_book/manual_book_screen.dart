import 'package:flutter/material.dart';

import '../../core/models/manual_book.dart';
import '../../core/models/user_profile.dart';
import '../../core/services/cloudinary_upload_service.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/picked_file_helper.dart';
import '../../core/utils/url_utils.dart';

/// Layar global Manual Book Smartsa LMS (`manual_books` Cloud Firestore).
class ManualBookScreen extends StatefulWidget {
  const ManualBookScreen({
    super.key,
    required this.profile,
    required this.firestoreService,
    required this.cloudinaryUploadService,
  });

  final UserProfile profile;
  final FirestoreService firestoreService;
  final CloudinaryUploadService cloudinaryUploadService;

  @override
  State<ManualBookScreen> createState() => _ManualBookScreenState();
}

class _ManualBookScreenState extends State<ManualBookScreen> {
  final _searchCtrl = TextEditingController();

  List<ManualBookItem> _books = const <ManualBookItem>[];
  bool _loading = true;
  String? _errorMsg;
  String _query = '';

  bool get _isEducatorOrAdmin =>
      widget.profile.isLecturer || widget.profile.isAdmin;

  @override
  void initState() {
    super.initState();
    _loadBooks();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadBooks() async {
    setState(() {
      _loading = true;
      _errorMsg = null;
    });
    try {
      final list = await widget.firestoreService.fetchManualBooks();
      if (!mounted) return;
      setState(() => _books = list);
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMsg = 'Gagal memuat Manual Book: $e');
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _openPdf(ManualBookItem book) async {
    final launched = await UrlUtils.launchSafeExternalUrl(
      book.fileUrl,
      requireHttps: true,
    );
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('URL PDF tidak valid atau gagal dibuka (wajib https://).'),
          backgroundColor: AppColors.rose,
        ),
      );
    }
  }

  Future<void> _openUploadDialog() async {
    final created = await showDialog<ManualBookItem>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => _UploadManualBookDialog(
        profile: widget.profile,
        firestoreService: widget.firestoreService,
        cloudinaryUploadService: widget.cloudinaryUploadService,
      ),
    );
    if (created == null || !mounted) return;

    setState(() {
      _books = <ManualBookItem>[created, ..._books];
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Manual Book "${created.title}" berhasil diterbitkan.'),
        backgroundColor: AppColors.emerald,
      ),
    );
  }

  Future<void> _confirmDeleteBook(ManualBookItem book) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Hapus Manual Book'),
        content: Text(
          'Hapus dokumen "${book.title}" secara permanen dari Firestore?',
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
            child: const Text('Hapus'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;
    try {
      await widget.firestoreService.deleteManualBook(book.id);
      if (!mounted) return;
      setState(() {
        _books = _books.where((b) => b.id != book.id).toList(growable: false);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Manual Book "${book.title}" dihapus.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Gagal menghapus Manual Book: $e'),
          backgroundColor: AppColors.rose,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final cleanQ = _query.trim().toLowerCase();
    final filtered = cleanQ.isEmpty
        ? _books
        : _books
            .where(
              (b) =>
                  b.title.toLowerCase().contains(cleanQ) ||
                  b.description.toLowerCase().contains(cleanQ) ||
                  b.fileName.toLowerCase().contains(cleanQ),
            )
            .toList(growable: false);

    return RefreshIndicator(
      onRefresh: _loadBooks,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _searchCtrl,
                  onChanged: (v) => setState(() => _query = v),
                  decoration: InputDecoration(
                    hintText: 'Cari judul Manual Book PDF...',
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
              if (_isEducatorOrAdmin) ...[
                const SizedBox(width: 10),
                SizedBox(
                  height: 50,
                  child: ElevatedButton.icon(
                    onPressed: _openUploadDialog,
                    icon: const Icon(Icons.upload_file),
                    label: const Text('Unggah'),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 16),

          if (_errorMsg != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  _errorMsg!,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.rose,
                  ),
                ),
              ),
            )
          else if (_loading && _books.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (filtered.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Icon(
                      Icons.menu_book_outlined,
                      size: 40,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      cleanQ.isNotEmpty
                          ? 'Tidak ada dokumen cocok dengan "$cleanQ"'
                          : 'Belum ada Manual Book tersedia',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _isEducatorOrAdmin
                          ? 'Unggah buku panduan PDF melalui tombol Unggah di atas.'
                          : 'Dokumen panduan resmi Smartsa LMS akan tampil di sini.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            )
          else
            for (final book in filtered)
              Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: AppColors.amber.withValues(alpha: 0.14),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Icon(
                              Icons.picture_as_pdf_outlined,
                              color: isDark
                                  ? AppColors.amber
                                  : AppColors.amberDark,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  book.title,
                                  style: theme.textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                if (book.description.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    book.description,
                                    style: theme.textTheme.bodySmall,
                                  ),
                                ],
                                const SizedBox(height: 6),
                                Wrap(
                                  spacing: 10,
                                  runSpacing: 4,
                                  children: [
                                    Text(
                                      'Oleh ${book.uploadedByName}',
                                      style: theme.textTheme.labelSmall,
                                    ),
                                    if (book.fileSize.isNotEmpty)
                                      Text(
                                        book.fileSize,
                                        style: theme.textTheme.labelSmall,
                                      ),
                                    Text(
                                      book.createdAtLabel,
                                      style: theme.textTheme.labelSmall,
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          if (_isEducatorOrAdmin)
                            IconButton(
                              tooltip: 'Hapus Manual Book',
                              onPressed: () => _confirmDeleteBook(book),
                              icon: const Icon(
                                Icons.delete_outline,
                                color: AppColors.rose,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: () => _openPdf(book),
                          icon: const Icon(Icons.open_in_new, size: 16),
                          label: const Text('Buka / Unduh PDF'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
        ],
      ),
    );
  }
}

class _UploadManualBookDialog extends StatefulWidget {
  const _UploadManualBookDialog({
    required this.profile,
    required this.firestoreService,
    required this.cloudinaryUploadService,
  });

  final UserProfile profile;
  final FirestoreService firestoreService;
  final CloudinaryUploadService cloudinaryUploadService;

  @override
  State<_UploadManualBookDialog> createState() =>
      _UploadManualBookDialogState();
}

class _UploadManualBookDialogState extends State<_UploadManualBookDialog> {
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  PickedUploadFile? _pickedFile;
  bool _submitting = false;
  String? _errorText;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickPdf() async {
    try {
      final file = await pickAndValidateUploadFile(
        category: 'document',
        allowedExtensions: const <String>['pdf'],
        mimeType: 'application/pdf',
      );
      if (file == null || !mounted) return;
      setState(() {
        _pickedFile = file;
        _errorText = null;
        if (_titleCtrl.text.trim().isEmpty) {
          _titleCtrl.text = file.name
              .replaceAll(RegExp(r'\.pdf$', caseSensitive: false), '')
              .replaceAll(RegExp(r'[_-]+'), ' ')
              .trim();
        }
      });
    } catch (e) {
      if (mounted) {
        setState(() => _errorText = e.toString());
      }
    }
  }

  Future<void> _submit() async {
    final title = _titleCtrl.text.trim();
    if (title.isEmpty) {
      setState(() => _errorText = 'Judul Manual Book wajib diisi.');
      return;
    }
    final picked = _pickedFile;
    if (picked == null) {
      setState(() => _errorText = 'Pilih berkas PDF terlebih dahulu.');
      return;
    }

    setState(() {
      _submitting = true;
      _errorText = null;
    });

    try {
      final uploadRes = await widget.cloudinaryUploadService.uploadFile(
        category: 'document',
        fileName: picked.name,
        fileSize: picked.fileSize,
        bytes: picked.bytes,
        filePath: picked.filePath,
        mimeType: 'application/pdf',
      );

      final created = await widget.firestoreService.createManualBook(
        title: title,
        description: _descCtrl.text.trim(),
        fileUrl: uploadRes.url,
        fileName: uploadRes.fileName,
        fileSize: uploadRes.fileSizeLabel,
        storageType: 'cloudinary',
        uploadedByUid: widget.profile.uid,
        uploadedByName: widget.profile.effectiveName,
      );

      if (!mounted) return;
      Navigator.of(context).pop(created);
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorText = e.toString());
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Unggah Manual Book PDF'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            OutlinedButton.icon(
              onPressed: _submitting ? null : _pickPdf,
              icon: const Icon(Icons.attach_file),
              label: Text(
                _pickedFile == null
                    ? 'Pilih Berkas PDF'
                    : '${_pickedFile!.name} (${_pickedFile!.sizeLabel})',
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _titleCtrl,
              enabled: !_submitting,
              decoration: const InputDecoration(labelText: 'Judul Manual Book'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descCtrl,
              enabled: !_submitting,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Deskripsi Singkat (Opsional)',
              ),
            ),
            if (_errorText != null) ...[
              const SizedBox(height: 12),
              Text(
                _errorText!,
                style: const TextStyle(color: AppColors.rose, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(),
          child: const Text('Batal'),
        ),
        ElevatedButton(
          onPressed: _submitting ? null : _submit,
          child: _submitting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.black,
                  ),
                )
              : const Text('Unggah & Terbitkan'),
        ),
      ],
    );
  }
}
