import { useId } from 'react';
import type { ReactNode } from 'react';
import type { SetupSection } from '../../shell/router';
import type { ChipSection } from '../../state/selectors';
import { useTrainer } from '../../state/TrainerProvider';

/**
 * The header chips whose pending flags cover a Setup section (none: a section no fight depends
 * on). Fight settings also follow "setup": enabling Heroism is an enabled buff (the Setup chip's
 * field), its start and duration are the Fight chip's.
 */
const PENDING_CHIPS: Readonly<Record<SetupSection, readonly ChipSection[]>> = {
  gear: ['gear'],
  talents: ['talents'],
  buffs: ['setup'],
  items: ['setup'],
  rotation: ['rotation'],
  fight: ['fight', 'setup'],
  class: ['setup'],
  scenarios: [],
  'combat-text': [],
};

/** "Changed since the running fight started…" when the section's part of the setup waits for R. */
export function PendingNote({ section }: { section: SetupSection }) {
  const { meta } = useTrainer();
  if (!PENDING_CHIPS[section].some((chip) => meta.pending[chip])) return null;
  return (
    <p className="note pending" role="status">
      {meta.phase === 'ended' ? 'Changed since the last fight' : 'Changed since the running fight started'}: it applies after you
      reset the fight (<kbd>R</kbd>).
    </p>
  );
}

export interface SectionProps {
  section: SetupSection;
  title: string;
  description: ReactNode;
  /** Buttons at the header's end (Import, Export, presets, Reset). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * One Setup section: `section[aria-labelledby]` with the view's only `h1` (the section's name), a
 * line about it, its actions, the pending note, then its content.
 */
export function SetupSectionFrame({ section, title, description, actions, children }: SectionProps) {
  const id = useId();
  return (
    <section className="sv-section" aria-labelledby={id} data-section={section}>
      <div className="sec-head">
        <h1 id={id}>{title}</h1>
        <p>{description}</p>
        {actions && <div className="actions">{actions}</div>}
      </div>
      <PendingNote section={section} />
      {children}
    </section>
  );
}

/** A titled group of a section (a card): `role=group` named by its title, with an optional count ("6 of 7 on"). */
export function SetupCard({ title, count, width = 'auto', children }: { title: string; count?: string; width?: 'auto' | 'full'; children: ReactNode }) {
  return (
    <section className={width === 'full' ? 'sv-card sv-card-full' : 'sv-card'} role="group" aria-label={title}>
      <h2>
        {title}
        {count && <small>{count}</small>}
      </h2>
      {children}
    </section>
  );
}
