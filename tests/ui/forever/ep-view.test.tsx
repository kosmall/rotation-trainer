import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EP_STATS } from '../../../src/forever/ep';
import { DEFAULT_SETTINGS, runJob, type EpOutcome } from '../../../src/forever/web/api';
import { EpView } from '../../../src/ui/forever/EpView';
import type { ForeverRun } from '../../../src/ui/forever/useForeverRun';

afterEach(cleanup);

const settings = { ...DEFAULT_SETTINGS, sessions: 6, level: 50 };
const idle: ForeverRun = { status: 'idle', done: 0, total: 0, error: null, results: {}, run: () => undefined, cancel: () => undefined };
const IDS = ['AFF_WRACK', 'DEMO_PACT_R1', 'DEMO_FIRE'];
const outcome = (): EpOutcome => {
  const r = runJob({ kind: 'ep', settings, builds: ['AFF_WRACK', 'DEMO_PACT_R1'] });
  if (r.kind !== 'ep') throw new Error('kind');
  return r;
};
const view = (o: EpOutcome | undefined, over: Partial<Parameters<typeof EpView>[0]> = {}) =>
  render(<EpView settings={settings} run={idle} outcome={o} ids={IDS} initial="AFF_WRACK" onRun={() => undefined} {...over} />);

describe('EpView', () => {
  it('shows a column per build and a row per stat, with the markers, legend and warnings', () => {
    view(outcome());
    const table = screen.getByRole('table', { name: 'Wagi statów (EP)' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['stat', 'AFF_WRACK', 'DEMO_PACT_R1']);
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual([...EP_STATS]);
    const sp = within(table).getByRole('row', { name: /spellPower/ });
    expect(within(sp).getAllByRole('cell')[0]?.textContent).toMatch(/^1\.00 \(1\.00\.\.1\.00\)/);
    const hit = within(table).getByRole('row', { name: /hitPct/ });
    expect(within(hit).getAllByRole('cell')[0]?.textContent).toBe('capped (0)');
    expect(screen.getByText(/strategia Life Tapa: Najlepsza, 1 mob/)).toBeTruthy();
    expect(screen.getByText(/placeholder/i)).toBeTruthy();
    expect(screen.getByText(/limitu trafienia/)).toBeTruthy();
    expect(screen.getByText(/capped/, { selector: '.fv-legend *, .fv-legend' })).toBeTruthy();
    expect(table.closest('.fv-scroll')).not.toBeNull();
  });

  it('asks to pick builds before the first run', () => {
    view(undefined);
    expect(screen.getByText('Wybierz buildy i kliknij Policz EP')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('cannot run without a build picked', () => {
    const onRun = vi.fn();
    view(undefined, { onRun });
    fireEvent.click(screen.getByRole('checkbox', { name: 'AFF_WRACK' }));
    const btn = screen.getByRole('button', { name: 'Policz EP' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onRun).not.toHaveBeenCalled();
  });

  it('runs the picked builds, the initial one preselected', () => {
    const onRun = vi.fn();
    view(undefined, { onRun });
    expect((screen.getByRole('checkbox', { name: 'AFF_WRACK' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'DEMO_PACT_R1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Policz EP' }));
    expect(onRun).toHaveBeenCalledWith(['AFF_WRACK', 'DEMO_PACT_R1']);
  });

  it('says for which level the weights were computed and warns when the setting moved on', () => {
    const { unmount } = view(outcome());
    expect(screen.getByText(/Level 50/)).toBeTruthy();
    expect(screen.queryByText(/ustawienie to/)).toBeNull();
    unmount();
    view(outcome(), { settings: { ...settings, level: 45 } });
    expect(screen.getByText(/ustawienie to 45/)).toBeTruthy();
  });

  it('a build where spell power gains nothing shows n/a and an explanation, never NaN', () => {
    const o = outcome();
    const r = o.results[0]!;
    r.valid = false;
    for (const s of EP_STATS) {
      r.weights[s].weight = null;
      r.weights[s].ci95 = null;
    }
    view(o);
    const table = screen.getByRole('table', { name: 'Wagi statów (EP)' });
    expect(screen.getByText(/spell power nie zwiększa zabić\/h/)).toBeTruthy();
    expect(within(within(table).getByRole('row', { name: /stamina/ })).getAllByRole('cell')[0]?.textContent).toBe('n/a');
    expect(table.textContent).not.toMatch(/NaN|Infinity/);
  });
});
