// The ranking shows what became of the demon: its health at the start of a pull, its deaths and the Health Funnel time.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, runJob, type RankingResult } from '../../../src/forever/web/api';
import { RankingTable } from '../../../src/ui/forever/SimView';

afterEach(cleanup);

const ranking = runJob({ kind: 'ranking', settings: { ...DEFAULT_SETTINGS, level: 41, sessions: 5 } }) as RankingResult;

describe('the demon in the ranking table', () => {
  it('has its health at the start of a pull, its deaths and the Health Funnel time per kill', () => {
    render(<RankingTable ranking={ranking} />);
    const table = screen.getByRole('table', { name: 'Ranking buildów' });
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(expect.arrayContaining(['Demon HP', 'Zgony demona/h', 'Funnel s']));
    const at = (name: string) => heads.indexOf(name);
    for (const row of ranking.rows) {
      const tr = within(table).getByRole('row', { name: new RegExp(`\\b${row.metrics.variant}\\b`) });
      const cells = [...tr.children].map((c) => c.textContent);
      expect(cells[at('Demon HP')]).toBe(`${row.metrics.petHpStartPct!.toFixed(0)}%`);
      expect(cells[at('Zgony demona/h')]).toBe(row.metrics.petDeathsPerHour.toFixed(2));
      expect(cells[at('Funnel s')]).toBe(row.metrics.funnelSecPerKill.toFixed(1));
    }
  });
  it('shows a dash for a result without a demon or from before the demon health', () => {
    const old = { ...ranking, rows: ranking.rows.slice(0, 1).map((r) => ({ ...r, metrics: { ...r.metrics, petHpStartPct: null, funnelSecPerKill: undefined as unknown as number } })) };
    render(<RankingTable ranking={old} />);
    const table = screen.getByRole('table', { name: 'Ranking buildów' });
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    const cells = [...table.querySelectorAll('tbody tr')[0]!.children].map((c) => c.textContent);
    expect(cells[heads.indexOf('Demon HP')]).toBe('–');
    expect(cells[heads.indexOf('Funnel s')]).toBe('–');
  });
});
