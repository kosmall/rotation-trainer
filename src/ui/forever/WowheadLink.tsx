import { useEffect, type ReactNode } from 'react';
import { TALENT_WOWHEAD_IDS } from './wowheadIds';

const SCRIPT_SRC = 'https://wow.zamimg.com/js/tooltips.js';

interface WowheadWindow extends Window {
  whTooltips?: Record<string, unknown>;
  $WowheadPower?: { refreshLinks?: () => void };
}

/** Loads Wowhead's tooltip script once (no icons or colours added to our links); later calls just rescan the page. */
function ensureScript(): void {
  const w = window as WowheadWindow;
  if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
    w.$WowheadPower?.refreshLinks?.();
    return;
  }
  w.whTooltips = { colorLinks: false, iconizeLinks: false, renameLinks: false };
  const s = document.createElement('script');
  s.src = SCRIPT_SRC;
  s.async = true;
  document.head.appendChild(s);
}

/** Wraps children in a link that shows the Wowhead Forever tooltip of a talent; plain children when its id is unknown. */
export function TalentWowheadLink({ talentId, children }: { talentId: string; children: ReactNode }) {
  const spell = TALENT_WOWHEAD_IDS[talentId];
  useEffect(() => {
    if (spell !== undefined) ensureScript();
  });
  if (spell === undefined) return <>{children}</>;
  return (
    <a className="fv-wh" href={`https://www.wowhead.com/forever/spell=${spell}`} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export const hasWowheadTip = (talentId: string): boolean => talentId in TALENT_WOWHEAD_IDS;
