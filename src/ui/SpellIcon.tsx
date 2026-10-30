import { useState } from 'react';

/** Where `npm run icons` stores an icon (public/icons/spells/, served under the app base path). */
export function iconUrl(icon: string): string {
  return `${import.meta.env.BASE_URL}icons/spells/${icon}.jpg`;
}

/**
 * Where `npm run icons` stores an item, gem or enchant icon (public/icons/items/, the item
 * database's `icon` names; served under the app base path).
 */
export function itemIconUrl(icon: string): string {
  return `${import.meta.env.BASE_URL}icons/items/${icon}.jpg`;
}

/**
 * The spell or aura icon (`kind` 'item': an item, gem or enchant icon), laid over the initials
 * tile by CSS. If the file is missing the image removes itself, so the tile (school colour +
 * initials) underneath stays as the fallback.
 */
export function SpellIcon({ icon, className, kind = 'spell' }: { icon: string; className: string; kind?: 'spell' | 'item' }) {
  const src = kind === 'item' ? itemIconUrl(icon) : iconUrl(icon);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return null;
  return <img className={className} src={src} alt="" draggable={false} onError={() => setFailedSrc(src)} />;
}
