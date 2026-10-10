'use client';

/**
 * Avatar
 * Reusable avatar component using next/image for optimized delivery.
 * Falls back gracefully to initials + gradient when no image is available
 * or when the image fails to load.
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
  /** Extra tailwind class names for the wrapper */
  className?: string;
}

export function Avatar({ src, name, size = 32, className = '' }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = Boolean(src) && !imgError;

  return (
    <div
      role="img"
      aria-label={name ?? 'Avatar'}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.3),
        background: showImage
          ? 'transparent'
          : 'linear-gradient(135deg, #7c5bf6, #38bdf8)',
      }}
    >
      {showImage ? (
        <Image
          src={src!}
          alt={name ?? ''}
          fill
          sizes={`${size}px`}
          className="object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}
