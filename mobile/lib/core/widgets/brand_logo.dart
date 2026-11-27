import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Emblem geometris resmi Smartsa LMS (dua trapesium kuning-oranye)
/// yang dirender via [CustomPainter] agar seragam 100% dengan komponen web.
class BrandLogo extends StatelessWidget {
  const BrandLogo({
    super.key,
    this.size = 32,
    this.glow = true,
  });

  final double size;
  final bool glow;

  @override
  Widget build(BuildContext context) {
    final width = size;
    final height = size * (36 / 32);

    final painter = CustomPaint(
      size: Size(width, height),
      painter: const _BrandLogoPainter(),
    );

    if (!glow) return painter;

    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        boxShadow: [
          BoxShadow(
            color: AppColors.amber.withValues(alpha: 0.35),
            blurRadius: 12,
            spreadRadius: -2,
          ),
        ],
      ),
      child: painter,
    );
  }
}

class _BrandLogoPainter extends CustomPainter {
  const _BrandLogoPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final sx = size.width / 32.0;
    final sy = size.height / 36.0;

    final topPaint = Paint()
      ..color = AppColors.amber
      ..style = PaintingStyle.fill;

    final bottomPaint = Paint()
      ..color = AppColors.amberLight
      ..style = PaintingStyle.fill;

    // SVG: M4 4 L22 4 L14 16 L4 16 Z
    final topPath = Path()
      ..moveTo(4 * sx, 4 * sy)
      ..lineTo(22 * sx, 4 * sy)
      ..lineTo(14 * sx, 16 * sy)
      ..lineTo(4 * sx, 16 * sy)
      ..close();

    // SVG: M10 18 L28 18 L18 32 L8 32 Z
    final bottomPath = Path()
      ..moveTo(10 * sx, 18 * sy)
      ..lineTo(28 * sx, 18 * sy)
      ..lineTo(18 * sx, 32 * sy)
      ..lineTo(8 * sx, 32 * sy)
      ..close();

    canvas.drawPath(topPath, topPaint);
    canvas.drawPath(bottomPath, bottomPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
