import { useState } from 'react';

/** Where `npm run icons` stores an icon (public/icons/spells/, served under the app base path). */
export function iconUrl(icon: string): string {
  return `${import.meta.env.BASE_URL}icons/spells/${icon}.jpg`;
}

/**
 * The spell or aura icon, laid over the initials tile by CSS. If the file is missing the image
 * removes itself, so the tile (school colour + initials) underneath stays as the fallback.
 */
export function SpellIcon({ icon, className }: { icon: string; className: string }) {
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  if (failedIcon === icon) return null;
  return <img className={className} src={iconUrl(icon)} alt="" draggable={false} onError={() => setFailedIcon(icon)} />;
}
