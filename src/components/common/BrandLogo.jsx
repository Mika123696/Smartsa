const SIZE_CLASSES = {
  xs: 'w-5 h-[22px]',
  sm: 'w-7 h-8',
  md: 'w-8 h-9',
  lg: 'w-10 h-11',
};

/**
 * Reusable Brand Logo Smartsa LMS (emblem geometris kuning-oranye).
 * Dirender murni via React JSX SVG tanpa dangerouslySetInnerHTML.
 */
export default function BrandLogo({
  size = 'md',
  glow = true,
  alt = '',
  className = '',
}) {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const glowClass = glow ? 'drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]' : '';

  return (
    <svg
      viewBox="0 0 32 36"
      fill="none"
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : 'true'}
      className={`${sizeClass} ${glowClass} shrink-0 ${className}`.trim()}
    >
      <path d="M4 4L22 4L14 16L4 16Z" fill="#f59e0b" />
      <path d="M10 18L28 18L18 32L8 32Z" fill="#fbbf24" />
    </svg>
  );
}
