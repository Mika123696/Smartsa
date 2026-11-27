import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../core/theme/app_theme.dart';
import '../../core/utils/attendance_qr_utils.dart';

/// Layar kamera full-screen untuk memindai QR Code presensi Smartsa (`SMARTSA_QR:<KODE>`).
///
/// Menghentikan dan men-dispose [MobileScannerController] secara bersih segera
/// setelah QR valid terbaca atau saat layar ditutup / ditinggalkan.
class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({
    super.key,
    this.classTitle = '',
  });

  final String classTitle;

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> {
  late final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    formats: const <BarcodeFormat>[BarcodeFormat.qrCode],
  );

  bool _handledScan = false;
  DateTime? _lastInvalidWarningAt;

  @override
  void dispose() {
    unawaited(_releaseController());
    super.dispose();
  }

  Future<void> _releaseController() async {
    try {
      await _controller.stop();
    } catch (_) {}
    try {
      await _controller.dispose();
    } catch (_) {}
  }

  Future<void> _handleDetect(BarcodeCapture capture) async {
    if (_handledScan) return;

    for (final barcode in capture.barcodes) {
      final raw = barcode.rawValue ?? barcode.displayValue ?? '';
      final parsed = AttendanceQrUtils.parsePayload(raw);
      if (AttendanceQrUtils.isValidSessionCode(parsed)) {
        _handledScan = true;
        try {
          await _controller.stop();
        } catch (_) {}
        if (mounted) {
          Navigator.of(context).pop(parsed);
        }
        return;
      }
    }

    final now = DateTime.now();
    if (_lastInvalidWarningAt == null ||
        now.difference(_lastInvalidWarningAt!) > const Duration(seconds: 3)) {
      _lastInvalidWarningAt = now;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'QR terbaca bukan kode sesi presensi Smartsa yang valid.',
            ),
            duration: Duration(seconds: 2),
          ),
        );
      }
    }
  }

  Future<void> _retryCamera() async {
    try {
      await _controller.stop();
    } catch (_) {}
    try {
      await _controller.start();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Pindai QR Presensi',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            if (widget.classTitle.trim().isNotEmpty)
              Text(
                widget.classTitle.trim(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.amber,
                ),
              ),
          ],
        ),
        actions: [
          ValueListenableBuilder<MobileScannerState>(
            valueListenable: _controller,
            builder: (context, state, _) {
              final torchUnavailable =
                  state.torchState == TorchState.unavailable;
              final torchOn = state.torchState == TorchState.on;
              return IconButton(
                tooltip: torchOn ? 'Matikan Flash' : 'Nyalakan Flash',
                onPressed: torchUnavailable || !state.isRunning
                    ? null
                    : () => _controller.toggleTorch(),
                icon: Icon(
                  torchOn ? Icons.flash_on : Icons.flash_off,
                  color: torchOn ? AppColors.amber : Colors.white,
                ),
              );
            },
          ),
          ValueListenableBuilder<MobileScannerState>(
            valueListenable: _controller,
            builder: (context, state, _) {
              final cameras = state.availableCameras;
              if (cameras != null && cameras < 2) {
                return const SizedBox.shrink();
              }
              return IconButton(
                tooltip: 'Ganti Kamera',
                onPressed: !state.isRunning
                    ? null
                    : () => _controller.switchCamera(),
                icon: const Icon(Icons.cameraswitch_outlined),
              );
            },
          ),
        ],
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: (capture) => unawaited(_handleDetect(capture)),
            placeholderBuilder: (_) => const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(color: AppColors.amber),
                  SizedBox(height: 12),
                  Text(
                    'Mengaktifkan kamera...',
                    style: TextStyle(color: Colors.white70),
                  ),
                ],
              ),
            ),
            errorBuilder: (context, error) {
              final denied =
                  error.errorCode == MobileScannerErrorCode.permissionDenied;
              final unsupported =
                  error.errorCode == MobileScannerErrorCode.unsupported;
              final title = denied
                  ? 'Izin Kamera Ditolak'
                  : unsupported
                      ? 'Kamera Tidak Didukung'
                      : 'Kamera Tidak Dapat Diakses';
              final desc = denied
                  ? 'Izinkan akses kamera pada pengaturan aplikasi Android untuk memindai QR, atau kembali untuk memasukkan kode sesi secara manual.'
                  : (error.errorDetails?.message ??
                        'Pastikan kamera tersedia dan tidak sedang dipakai aplikasi lain.');

              return ColoredBox(
                color: AppColors.darkBackground,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.no_photography_outlined,
                          size: 52,
                          color: AppColors.rose,
                        ),
                        const SizedBox(height: 14),
                        Text(
                          title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          desc,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 18),
                        Wrap(
                          spacing: 10,
                          runSpacing: 10,
                          alignment: WrapAlignment.center,
                          children: [
                            if (!unsupported)
                              OutlinedButton.icon(
                                onPressed: _retryCamera,
                                icon: const Icon(Icons.refresh),
                                label: const Text('Coba Lagi'),
                              ),
                            ElevatedButton.icon(
                              onPressed: () => Navigator.of(context).pop(),
                              icon: const Icon(Icons.keyboard_alt_outlined),
                              label: const Text('Input Kode Manual'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
            overlayBuilder: (context, constraints) {
              final side = constraints.biggest.shortestSide * 0.68;
              return CustomPaint(
                size: constraints.biggest,
                painter: _ScannerCutoutPainter(boxSize: side.clamp(200.0, 290.0)),
              );
            },
          ),
          Positioned(
            left: 20,
            right: 20,
            bottom: 28,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.72),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.amber.withValues(alpha: 0.45),
                ),
              ),
              child: const Text(
                'Arahkan bingkai ke QR Code proyektor dosen (SMARTSA_QR). Kamera berhenti otomatis setelah kode terbaca.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white, fontSize: 12),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ScannerCutoutPainter extends CustomPainter {
  const _ScannerCutoutPainter({required this.boxSize});

  final double boxSize;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final holeRect = Rect.fromCenter(
      center: center,
      width: boxSize,
      height: boxSize,
    );

    final overlayPath = Path()
      ..addRect(Offset.zero & size)
      ..addRRect(RRect.fromRectAndRadius(holeRect, const Radius.circular(18)))
      ..fillType = PathFillType.evenOdd;

    canvas.drawPath(
      overlayPath,
      Paint()..color = Colors.black.withValues(alpha: 0.56),
    );

    final borderPaint = Paint()
      ..color = AppColors.amber
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5
      ..strokeCap = StrokeCap.round;

    const corner = 26.0;
    final l = holeRect.left;
    final t = holeRect.top;
    final r = holeRect.right;
    final b = holeRect.bottom;

    // Sudut kiri-atas
    canvas.drawPath(
      Path()
        ..moveTo(l, t + corner)
        ..lineTo(l, t)
        ..lineTo(l + corner, t),
      borderPaint,
    );
    // Sudut kanan-atas
    canvas.drawPath(
      Path()
        ..moveTo(r - corner, t)
        ..lineTo(r, t)
        ..lineTo(r, t + corner),
      borderPaint,
    );
    // Sudut kiri-bawah
    canvas.drawPath(
      Path()
        ..moveTo(l, b - corner)
        ..lineTo(l, b)
        ..lineTo(l + corner, b),
      borderPaint,
    );
    // Sudut kanan-bawah
    canvas.drawPath(
      Path()
        ..moveTo(r - corner, b)
        ..lineTo(r, b)
        ..lineTo(r, b - corner),
      borderPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _ScannerCutoutPainter oldDelegate) {
    return oldDelegate.boxSize != boxSize;
  }
}
