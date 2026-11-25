import { useState } from 'react';
import { FOREVER_ONLY_TALENT_ICONS, PET_ICONS, SPELL_ICONS, TALENT_ICONS } from './icons';
import { iconUrl, talentIconUrl } from '../SpellIcon';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** A spell or talent icon over an initials tile (the tile stays when there is no icon file). */
export function IconTile({ kind, id, name, size = 40 }: { kind: 'spell' | 'talent' | 'pet'; id: string; name: string; size?: number }) {
  const icon = (kind === 'spell' ? SPELL_ICONS : kind === 'pet' ? PET_ICONS : TALENT_ICONS)[id];
  const src = icon ? (kind === 'talent' ? (FOREVER_ONLY_TALENT_ICONS.has(icon) ? `${import.meta.env.BASE_URL}icons/forever/${icon}.jpg` : talentIconUrl(icon)) : iconUrl(icon)) : null;
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className="fv-icon" style={{ width: size, height: size }} aria-hidden="true">
      <span className="fv-icon-tile">{initials(name)}</span>
      {src && failed !== src && <img src={src} width={size} height={size} alt="" draggable={false} onError={() => setFailed(src)} />}
    </span>
  );
}
