'use client';

import { useState } from 'react';
import { Facehash } from 'facehash';

const FACEHASH_COLORS = [
  '#8B5CF6', '#EC4899', '#F97316', '#06B6D4',
  '#10B981', '#6366F1', '#F43F5E', '#A855F7',
  '#14B8A6', '#EAB308',
];

interface TokenAvatarProps {
  src?: string | null;
  name: string;
  alt?: string;
  size?: number;
  className?: string;
  rounded?: 'full' | 'lg' | 'xl';
}

export function TokenAvatar({ src, name, alt, size = 40, className = '', rounded = 'lg' }: TokenAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const roundedClass = rounded === 'full' ? 'rounded-full' : rounded === 'xl' ? 'rounded-xl' : 'rounded-lg';

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={alt || name}
        style={{ width: size, height: size }}
        className={`${roundedClass} ${className}`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={`${roundedClass} overflow-hidden flex-shrink-0 ${className}`}
    >
      <Facehash
        name={name}
        size={size}
        showInitial={false}
        colors={FACEHASH_COLORS}
      />
    </div>
  );
}
