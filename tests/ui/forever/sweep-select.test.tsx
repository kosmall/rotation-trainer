import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runJob } from '../../../src/forever/web/api';
import type { JobRunner } from '../../../src/forever/web/client';
import { ForeverApp } from '../../../src/ui/forever/ForeverApp';
import { SweepChart } from '../../../src/ui/forever/SweepChart';
import { extremesAt, summarize } from '../../../src/ui/forever/sweepStats';

const requests: { kind: string; builds?: readonly string[] }[] = [];
const runner: JobRunner = async (req, o) => {
  requests.push(req as { kind: string; builds?: readonly string[] });
  return runJob({ ...req, settings: { ...req.settings, sessions: 5 } } as typeof req, o?.onProgress);
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  requests.length = 0;
  vi.restoreAllMocks();
});

const series = (values: Record<string, number[]>) => Object.entries(values).map(([id, v]) => ({ id, label: id, values: v }));

describe('sweep statistics', () => {
  it('finds the best and the worst builds of a level, with ties on the shown value', () => {
    const s = series({ A: [10, 5.04], B: [12, 5.0], C: [11, 3] });
    expect(extremesAt(s, 0)).toEqual({ best: ['B'], worst: ['A'] });
    expect(extremesAt(s, 1)).toEqual({ best: ['A', 'B'], worst: ['C'] });
  });

  it('has no best or worst when the builds do not differ, or there is only one', () => {
    expect(extremesAt(series({ A: [7], B: [7.01] }), 0)).toEqual({ best: [], worst: [] });
    expect(extremesAt(series({ A: [7] }), 0)).toEqual({ best: [], worst: [] });
  });

  it('ranks every build by the number of levels on which it is the best and the worst', () => {
    const s = series({ A: [9, 1, 5, 4], B: [1, 9, 5, 2], C: [5, 5, 5, 1] });
    const r = summarize(s, 4);
    expect(r.levels).toBe(3);
    expect(r.best).toEqual([
      { id: 'A', count: 2 },
      { id: 'B', count: 1 },
      { id: 'C', count: 0 },
    ]);
    // the same count: the order of the series
    expect(r.worst).toEqual([
      { id: 'A', count: 1 },
      { id: 'B', count: 1 },
      { id: 'C', count: 1 },
    ]);
  });
});

describe('SweepChart', () => {
  it('highlights the best value of every level and ranks the builds below', () => {
    render(<SweepChart title="T" levels={[10, 11, 12]} series={series({ A: [20, 10, 30], B: [10, 15, 25] })} valueName="zabić/h" />);
    const table = screen.getByRole('table', { name: 'Dane: T', hidden: true });
    const best = [...table.querySelectorAll('td.fv-top')].map((c) => c.textContent);
    const rank = (name: string) => screen.getByRole('table', { name, hidden: true });
    expect(best).toEqual(['20.0', '15.0', '30.0']);
    const rows = (name: string) =>
      [...rank(name).querySelectorAll('tbody tr')].map((r) => [...r.children].map((c) => c.textContent).join(' '));
    expect(rows('Ile razy najlepszy')).toEqual(['1 A 2', '2 B 1']);
    expect(rows('Ile razy najgorszy')).toEqual(['1 B 2', '2 A 1']);
    expect(rank('Ile razy najlepszy').querySelector('caption')?.textContent).toBe('Ile razy najlepszy (z 3 leveli)');
  });

  it('shows no ranking for a single build', () => {
    render(<SweepChart title="T" levels={[10]} series={series({ A: [1] })} valueName="zabić/h" />);
    expect(screen.queryByRole('table', { name: 'Ile razy najlepszy', hidden: true })).toBeNull();
  });
});

describe('picking builds for the curve', () => {
  const start = async () => {
    const view = render(<ForeverApp view="sim" runner={runner} />);
    fireEvent.click(screen.getByRole('button', { name: 'Uruchom symulację' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tabela' }));
    return view;
  };

  it('computes nothing until builds are ticked, then only those', async () => {
    await start();
    const button = () => screen.getByRole('button', { name: /^Krzywa 10–59 dla zaznaczonych/ }) as HTMLButtonElement;
    expect(button().disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Na krzywej: DT_SS' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Na krzywej: DEMO_FIRE' }));
    expect(button().textContent).toBe('Krzywa 10–59 dla zaznaczonych (2)');
    fireEvent.click(button());
    const table = await screen.findByRole('table', { name: /^Dane: Zabicia/, hidden: true }, { timeout: 20000 });
    const sweep = requests.find((r) => r.kind === 'sweep');
    expect([...(sweep?.builds ?? [])].sort()).toEqual(['DEMO_FIRE', 'DT_SS']);
    expect(within(table).getAllByRole('columnheader', { hidden: true })).toHaveLength(3);
    for (const name of ['Ile razy najlepszy', 'Ile razy najgorszy']) expect(screen.getByRole('table', { name, hidden: true }).querySelectorAll('tbody tr')).toHaveLength(2);
  }, 30000);

  it('ticks the best five or all, and clears', async () => {
    await start();
    const count = () => screen.getAllByRole('checkbox', { name: /^Na krzywej:/ }).filter((c) => (c as HTMLInputElement).checked).length;
    fireEvent.click(screen.getByRole('button', { name: 'Zaznacz 5 najlepszych' }));
    expect(count()).toBe(5);
    fireEvent.click(screen.getByRole('button', { name: 'Zaznacz wszystkie' }));
    expect(count()).toBe(screen.getAllByRole('checkbox', { name: /^Na krzywej:/ }).length);
    fireEvent.click(screen.getByRole('button', { name: 'Wyczyść' }));
    expect(count()).toBe(0);
  });

  it('keeps the ticks when the tab changes', async () => {
    const { rerender } = await start();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Na krzywej: AFF_WRACK' }));
    rerender(<ForeverApp view="builds" runner={runner} />);
    rerender(<ForeverApp view="sim" runner={runner} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tabela' }));
    expect((screen.getByRole('checkbox', { name: 'Na krzywej: AFF_WRACK' }) as HTMLInputElement).checked).toBe(true);
  });
});
