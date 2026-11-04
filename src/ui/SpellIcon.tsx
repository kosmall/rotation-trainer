import { useState } from 'react';
import { talentIconPath } from '../data/classes/warlock/talentTree';

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

/** Where `npm run icons` stores a talent icon (public/icons/talents/, the talent tree's `icon` names). */
export function talentIconUrl(icon: string): string {
  return `${import.meta.env.BASE_URL}${talentIconPath(icon)}`;
}

/**
 * The spell or aura icon (`kind` 'item': an item, gem or enchant icon; 'talent': a talent icon), laid over the initials
 * tile by CSS. If the file is missing the image removes itself, so the tile (school colour +
 * initials) underneath stays as the fallback.
 */
export function SpellIcon({ icon, className, kind = 'spell' }: { icon: string; className: string; kind?: 'spell' | 'item' | 'talent' }) {
  const src = kind === 'item' ? itemIconUrl(icon) : kind === 'talent' ? talentIconUrl(icon) : iconUrl(icon);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return null;
  // 56 x 56: every icon file (npm run icons); the attributes reserve the box before it loads.
  return <img className={className} src={src} width={56} height={56} alt="" draggable={false} onError={() => setFailedSrc(src)} />;
}
