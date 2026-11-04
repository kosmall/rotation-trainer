// Report → "Fight source" (fight timeline and key fights Task K3; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 A, E): which fight
// the Report's fight tabs show: the last played fight, the last simulation's highest DPS, typical
// (DPS closest to the mean) or lowest DPS fight, or a fight from the history ("History…" opens the
// Fights panel). Each option shows its DPS and seed; a key fight its run. A key fight without a
// simulation, or of a result without key fights, is disabled with the reason.

import { memo } from 'react';
import { formatDps } from '../format';
import type { KeyFightWhich } from './reportFight';
import type { HistoryEntry } from '../state/history';
import type { LastFight, LastSimulation, ReportSourceId } from '../state/TrainerProvider';

export interface SourceOption {
  /** 'played', a key fight, or 'history'. */
  id: 'played' | KeyFightWhich | 'history';
  label: string;
  /** "2,104.5 DPS, seed 123, run #4", the reason it is disabled, or a hint. */
  detail: string;
  disabled: boolean;
  pressed: boolean;
}

const KEY_LABELS: Readonly<Record<KeyFightWhich, string>> = { highest: 'Highest DPS', typical: 'Typical', lowest: 'Lowest DPS' };
const KEY_WORDS: Readonly<Record<KeyFightWhich, string>> = { highest: 'highest DPS', typical: 'typical', lowest: 'lowest DPS' };

/** The history entry's title: its name, else its kind and when it was saved. */
export function historyTitle(entry: HistoryEntry): string {
  if (entry.name !== undefined) return entry.name;
  const kind = entry.kind === 'played' ? 'Played fight' : `Simulation, ${KEY_WORDS[entry.kind.slice(4) as KeyFightWhich]}`;
  return `${kind}, ${dateText(entry.savedAt)}`;
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "4 Nov, 15:45" (the user's time zone). */
export function dateText(ms: number): string {
  try {
    return DATE.format(new Date(ms));
  } catch {
    return '–';
  }
}

/** The options of the selector for the trainer's state (pure). */
export function sourceOptions(
  source: ReportSourceId,
  lastFight: LastFight | null,
  lastSimulation: LastSimulation | null,
  historyEntry: HistoryEntry | null,
): SourceOption[] {
  const out: SourceOption[] = [
    {
      id: 'played',
      label: 'Last Played Fight',
      detail: lastFight === null ? 'No fight yet' : `${formatDps(lastFight.snapshot.dps)} DPS, seed ${lastFight.seed}`,
      disabled: false,
      pressed: source.kind === 'played',
    },
  ];
  for (const which of ['highest', 'typical', 'lowest'] as const) {
    const k = lastSimulation?.result.keyFights?.[which];
    out.push({
      id: which,
      label: KEY_LABELS[which],
      detail:
        lastSimulation === null
          ? 'Run the simulator first'
          : k === undefined
            ? 'Run the simulation again'
            : `${formatDps(k.dps)} DPS, seed ${k.seed}, run #${k.run + 1}`,
      disabled: k === undefined,
      pressed: source.kind === 'sim' && source.which === which,
    });
  }
  out.push({
    id: 'history',
    label: source.kind === 'history' ? 'History:' : 'History…',
    detail: source.kind === 'history' ? (historyEntry === null ? 'Not in the history' : `${historyTitle(historyEntry)}, ${formatDps(historyEntry.dps)} DPS`) : 'Your fights and the ranking',
    disabled: false,
    pressed: source.kind === 'history',
  });
  return out;
}

export interface FightSourceSelectProps {
  options: readonly SourceOption[];
  /** The Fights panel is open (the History button's `aria-expanded`). */
  historyOpen: boolean;
  onPick(id: SourceOption['id']): void;
}

/** The selector: a group of toggle buttons (one pressed), History… opens the Fights panel. */
export const FightSourceSelect = memo(function FightSourceSelect({ options, historyOpen, onPick }: FightSourceSelectProps) {
  return (
    <div className="fight-source" role="group" aria-label="Fight source">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={o.id === 'history' ? 'fs-opt fs-history' : 'fs-opt'}
          aria-pressed={o.pressed}
          aria-expanded={o.id === 'history' ? historyOpen : undefined}
          aria-controls={o.id === 'history' && historyOpen ? 'fights-panel' : undefined}
          disabled={o.disabled}
          onClick={() => onPick(o.id)}
        >
          <span className="fs-label">{o.label}</span> <span className="fs-detail tnum">{o.detail}</span>
        </button>
      ))}
    </div>
  );
});
