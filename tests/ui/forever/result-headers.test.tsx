// A5-010 / A5-004: result headers say which settings produced a result; the duel table says what each number is.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, runJob, type DuelOutcome, type RankingResult, type Settings, type SweepResult } from '../../../src/forever/web/api';
import { CompareView } from '../../../src/ui/forever/CompareView';
import { SimView } from '../../../src/ui/forever/SimView';
import type { ForeverRun } from '../../../src/ui/forever/useForeverRun';

afterEach(cleanup);

const run = { status: 'done' } as unknown as ForeverRun;
const noop = () => {};
const settings: Settings = { ...DEFAULT_SETTINGS, level: 45, sessions: 5, policy: 'USER', spellstone: true, eureka: 'pull_start' };
const ranking: RankingResult = { kind: 'ranking', settings, rows: [] };
const sweepOf = (s: Settings): SweepResult => ({ kind: 'sweep', settings: s, levels: [10, 11], series: [{ build: 'AFF_WRACK', kph: [50, 51] }] });
const sim = (extra: Partial<Parameters<typeof SimView>[0]> = {}) => (
  <SimView run={run} ranking={ranking} sweep={undefined} selected={new Set()} onSelect={noop} onSweep={noop} onOpenBuild={noop} {...extra} />
);

describe('ranking header (A5-010)', () => {
  it('names the Life Tap policy, Spellstone and Eureka! timing', () => {
    render(sim());
    const note = screen.getByText(/^Level 45/);
    expect(note.textContent).toContain('Reguła użytkownika');
    expect(note.textContent).toContain('Spellstone: tak');
    expect(note.textContent).toContain('Na starcie pulla');
  });
  it('says no Spellstone and no Eureka! when they are off', () => {
    render(sim({ ranking: { ...ranking, settings: { ...settings, spellstone: false, eureka: 'off' } } }));
    const note = screen.getByText(/^Level 45/);
    expect(note.textContent).toContain('Spellstone: nie');
    expect(note.textContent).toContain('Nie używaj');
  });
  it('gives the gear totals when the gear is "mine"', () => {
    const gear = { stamina: 10, intellect: 20, spirit: 30, armor: 0, spellPower: 123, shadowSpellPower: 45, critPct: 6, hitPct: 2 };
    render(sim({ ranking: { ...ranking, settings: { ...settings, profile: 'mine' } }, gear }));
    const note = screen.getByText(/^Level 45/);
    expect(note.textContent).toContain('123');
    expect(note.textContent).toContain('45');
  });
});

describe('level curve (A5-010)', () => {
  it('says it was computed with the settings at the click and lists what differs from the ranking', () => {
    render(sim({ sweep: sweepOf({ ...settings, policy: 'BEST_1MOB', spellstone: false }) }));
    const note = screen.getByText(/^Krzywa liczona z ustawieniami/);
    expect(note.textContent).toContain('Najlepsza, 1 mob');
    expect(note.textContent).toContain('strategia Life Tapa');
    expect(note.textContent).toContain('Spellstone');
  });
  it('says nothing about a difference when the curve used the settings of the ranking', () => {
    render(sim({ sweep: sweepOf(settings) }));
    const note = screen.getByText(/^Krzywa liczona z ustawieniami/);
    expect(note.textContent).not.toMatch(/Różni się od rankingu/);
  });
});

describe('duel (A5-010, A5-004)', () => {
  const duel = runJob({ kind: 'duel', settings, a: 'AFF_WRACK', b: 'DEMO_FIRE', sweep: false }) as DuelOutcome;
  it('names the policy, Spellstone and Eureka! timing, and warns when the current settings differ', () => {
    render(<CompareView settings={{ ...settings, policy: 'BEST_1MOB' }} run={run} duel={duel} onRun={noop} />);
    const note = screen.getByText(/^Level 45/);
    expect(note.textContent).toContain('Reguła użytkownika');
    expect(note.textContent).toContain('Spellstone: tak');
    expect(note.textContent).toContain('strategia Life Tapa');
  });
  it('labels what the kills/h columns and the difference are', () => {
    render(<CompareView settings={settings} run={run} duel={duel} onRun={noop} />);
    const note = screen.getByText(/Zabić\/h w kolumnach/);
    expect(note.textContent).toContain('łącznie');
    expect(note.textContent).toContain('średnia z różnic');
    // the matching estimator is shown too: the difference of the two pooled columns
    const pooled = duel.at.a.killsPerHour - duel.at.b.killsPerHour;
    expect(note.textContent).toContain(pooled.toFixed(1));
  });
});
