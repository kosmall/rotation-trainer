import { memo } from 'react';
import { ModeLinks } from './Header';
import type { Mode } from './router';

/** The modes at the bottom of a phone screen (below 900 px; hidden by CSS above), within thumb reach. */
export const TabBar = memo(function TabBar({ mode }: { mode: Mode }) {
  return (
    <nav className="tabbar" aria-label="Mode tabs">
      <ModeLinks current={mode} />
    </nav>
  );
});
