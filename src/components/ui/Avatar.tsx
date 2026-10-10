'use client';

/**
 * Avatar
 * Shows a user profile image with an initials+gradient fallback.
 *
 * Two rendering paths:
 * - Internal proxy URLs (/api/files/…): plain <img> tag so the browser
 *   sends the session cookie and the authenticated route returns the image.
 * - Public external URLs (https://…): next/image for CDN optimisation.
 *
 * Usage:
 *   <Avatar src={profile.avatar_url} name={profile.full_name} size={32} />
 */

import Image from 'next/image';
import { useState } from 'react';
import { getInitials } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  /** Pixel size of the avatar (square). Default: 32 */
  size?: number;
  /** Extra tailwind class names on the wrapper */
  className?: string;
}

/** Returns true when the URL needs to be fetched with credentials (session cookie). */
function isInternalUrl(url: string): boolean {
  return url.startsWith('/');
}

export function Avatar({ src, name, size = 32, className = '' }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = Boolean(src) && !imgError;

  const wrapperStyle = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * 0.35)),
    background: showImage ? 'transparent' : 'linear-gradient(135deg, #7c5bf6, #38bdf8)',
    flexShrink: 0 as const,
  };

  return (
    <div
      role="img"
      aria-label={name ?? 'Avatar'}
      className={`relative flex items-center justify-center overflow-hidden rounded-full font-bold text-white ${className}`}
      style={wrapperStyle}
    >
      {showImage && src ? (
        isInternalUrl(src) ? (
          /* ── Internal /api/files/ route — must send session cookie ── */
          <img
            src={src}
            alt={name ?? ''}
            width={size}
            height={size}
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          /* ── Public external URL (Supabase Storage, etc.) ── */
          <Image
            src={src}
            alt={name ?? ''}
            fill
            sizes={`${size}px`}
            className="object-cover"
            onError={() => setImgError(true)}
          />
        )
      ) : (
        /* ── Initials fallback ── */
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
    </div>
  );
}
