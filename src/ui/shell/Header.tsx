import { memo } from 'react';
import { iconUrl } from '../SpellIcon';
import type { ChipLabels, SpecIdentity } from '../state/TrainerProvider';
import type { ChipSection } from '../state/selectors';
import type { Theme } from '../theme/theme';
import { BrandSigil, ShellIcon } from './icons';
import { MODE_HREFS } from './router';
import type { Mode } from './router';
import { StatusChips } from './StatusChips';

/** The three modes, in order (the header's links and the mobile tab bar). */
export const MODES: readonly { mode: Mode; label: string }[] = [
  { mode: 'setup', label: 'Setup' },
  { mode: 'fight', label: 'Fight' },
  { mode: 'report', label: 'Report' },
];

/** The links to the three modes; the current one has `aria-current="page"`. */
export function ModeLinks({ current }: { current: Mode }) {
  return (
    <>
      {MODES.map(({ mode, label }) => (
        <a key={mode} href={MODE_HREFS[mode]} aria-current={mode === current ? 'page' : undefined}>
          <ShellIcon name={mode} />
          {label}
        </a>
      ))}
    </>
  );
}

/** The spec: its icon, its own name in the class colour and the class (all from `SpecData`). */
export function SpecChip({ spec }: { spec: SpecIdentity }) {
  return (
    <div className="spec-chip" title={`Spec: ${spec.specName} ${spec.className}`}>
      {spec.icon !== null && <img src={iconUrl(spec.icon)} width={24} height={24} alt="" />}
      <span>
        <b>{spec.specName}</b> {spec.className}
      </span>
    </div>
  );
}

export interface HeaderProps {
  mode: Mode;
  spec: SpecIdentity;
  labels: ChipLabels;
  pending: Readonly<Record<ChipSection, boolean>>;
  theme: Theme;
  onToggleTheme(): void;
}

/** The app header: brand, modes, spec, the next fight's status chips and the theme switch. */
export const Header = memo(function Header({ mode, spec, labels, pending, theme, onToggleTheme }: HeaderProps) {
  const other: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <header className="topbar">
      <a className="brand" href={MODE_HREFS.fight} aria-label="Rotation Trainer, go to the fight">
        <BrandSigil className="brand-mark" />
        <span className="brand-name">Rotation Trainer</span>
      </a>
      <nav className="modes" aria-label="Mode">
        <ModeLinks current={mode} />
      </nav>
      <SpecChip spec={spec} />
      <StatusChips labels={labels} pending={pending} />
      <button type="button" className="icon-btn" aria-label={`Switch to ${other} theme`} onClick={onToggleTheme}>
        <ShellIcon name={theme === 'dark' ? 'sun' : 'moon'} />
      </button>
    </header>
  );
});
