import { useState } from 'react';
import { BookOpen, Image as ImageIcon } from 'lucide-react';

function getInitials(text) {
  if (!text || typeof text !== 'string') return 'SM';
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function SafeImage({
  src,
  alt = '',
  fallbackLabel = '',
  variant = 'cover', // 'cover' | 'avatar' | 'media'
  className = '',
  fallbackClassName = '',
}) {
  const [failedSrc, setFailedSrc] = useState(null);
  const showFallback = !src || failedSrc === src;

  if (showFallback) {
    const initials = getInitials(fallbackLabel || alt);

    if (variant === 'avatar') {
      return (
        <div
          role="img"
          aria-label={alt || fallbackLabel || 'Avatar'}
          className={`flex items-center justify-center bg-gradient-to-br from-amber-500 to-indigo-600 text-white font-bold select-none ${className} ${fallbackClassName}`}
        >
          <span className="text-xs tracking-wider">{initials}</span>
        </div>
      );
    }

    return (
      <div
        role="img"
        aria-label={alt || fallbackLabel || 'Gambar kelas'}
        className={`flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 dark:from-[#161f2e] dark:via-[#121822] dark:to-[#0d1420] text-slate-500 dark:text-slate-400 select-none ${className} ${fallbackClassName}`}
      >
        {variant === 'media' ? (
          <ImageIcon className="w-6 h-6 opacity-60" />
        ) : (
          <BookOpen className="w-6 h-6 text-amber-500/80" />
        )}
        <span className="text-[11px] font-mono font-bold tracking-wider px-2 text-center line-clamp-1">
          {fallbackLabel || initials}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
}
