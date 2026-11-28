// The interactive charts of the simulator: lines and legend, the view of the gap to the leader, the tooltip,
// and their place in the ranking, comparison and EP views.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, runJob, type DuelOutcome, type EpOutcome, type RankingResult, type SweepResult } from '../../../src/forever/web/api';
import { EpChart } from '../../../src/ui/forever/charts/EpChart';
import { RankingChart } from '../../../src/ui/forever/charts/RankingChart';
import { TrendChart, TrendTooltip } from '../../../src/ui/forever/charts/TrendChart';
import { CompareView } from '../../../src/ui/forever/CompareView';
import { SimView } from '../../../src/ui/forever/SimView';
import type { ForeverRun } from '../../../src/ui/forever/useForeverRun';

afterEach(cleanup);

const levels = [40, 41, 42, 43];
const two = [
  { id: 'A', label: 'AFF', values: [100, 110, 120, 130] },
  { id: 'B', label: 'DEMO', values: [90, 120, 100, 140] },
];
const many = Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, label: `Build ${i}`, values: levels.map((_, k) => 100 + i + k) }));
const lines = (root: Element) => root.querySelectorAll('path.recharts-line-curve');
const legend = () => screen.getByRole('group', { name: 'Legenda wykresu' });

describe('TrendChart', () => {
  it('draws a line per build and a legend button for each, all on', () => {
    const { container } = render(<TrendChart title="T" levels={levels} series={two} valueName="zabić/h" />);
    expect(screen.getByRole('figure', { name: 'T' })).toBeTruthy();
    expect(lines(container)).toHaveLength(2);
    const buttons = within(legend()).getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
    expect(buttons[0]!.textContent).toContain('AFF');
    // the mean over the levels is next to the name
    expect(buttons[0]!.textContent).toContain('115.0');
  });

  it('colours only the best five of many; the rest stay grey in the background', () => {
    const { container } = render(<TrendChart title="T" levels={levels} series={many} valueName="zabić/h" />);
    expect(lines(container)).toHaveLength(12);
    expect(container.querySelectorAll('.fv-line-context path.recharts-line-curve')).toHaveLength(7);
    const on = within(legend()).getAllByRole('button', { pressed: true });
    expect(on.map((b) => b.querySelector('.fv-legend-name')!.textContent)).toEqual(['Build 11', 'Build 10', 'Build 9', 'Build 8', 'Build 7']);
  });

  it('a click in the legend brings a build into colour and out again', () => {
    const { container } = render(<TrendChart title="T" levels={levels} series={many} valueName="zabić/h" />);
    const zero = () => within(legend()).getByRole('button', { name: /Build 0 / });
    fireEvent.click(zero());
    expect(zero().getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('.fv-line-context path.recharts-line-curve')).toHaveLength(6);
    fireEvent.click(zero());
    expect(zero().getAttribute('aria-pressed')).toBe('false');
  });

  it('pointing at a legend entry fades the other lines', () => {
    const { container } = render(<TrendChart title="T" levels={levels} series={two} valueName="zabić/h" />);
    fireEvent.mouseEnter(within(legend()).getByRole('button', { name: /AFF/ }));
    expect(container.querySelectorAll('.fv-line-faded path.recharts-line-curve')).toHaveLength(1);
    fireEvent.mouseLeave(within(legend()).getByRole('button', { name: /AFF/ }));
    expect(container.querySelectorAll('.fv-line-faded path.recharts-line-curve')).toHaveLength(0);
  });

  it('switches between the values and the percent behind the leader', () => {
    render(<TrendChart title="T" levels={levels} series={two} valueName="zabić/h" />);
    const view = screen.getByRole('group', { name: 'Widok wykresu' });
    const gap = within(view).getByRole('button', { name: 'Strata do najlepszego (%)' });
    expect(within(view).getByRole('button', { name: 'Wartości' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(gap);
    expect(gap.getAttribute('aria-pressed')).toBe('true');
  });

  it('one build needs no view switch', () => {
    render(<TrendChart title="T" levels={levels} series={two.slice(0, 1)} valueName="zabić/h" />);
    expect(screen.queryByRole('group', { name: 'Widok wykresu' })).toBeNull();
  });

  it('has a slider to narrow the levels when there are many of them', () => {
    const long = Array.from({ length: 20 }, (_, i) => 40 + i);
    const { container } = render(<TrendChart title="T" levels={long} series={[{ id: 'A', label: 'A', values: long }]} valueName="zabić/h" />);
    expect(container.querySelector('.recharts-brush')).not.toBeNull();
  });

  it('the slider really narrows the levels and stays narrowed while the legend is used', () => {
    const long = Array.from({ length: 20 }, (_, i) => 40 + i);
    const { container } = render(<TrendChart title="T" levels={long} series={[{ id: 'A', label: 'A', values: long }]} valueName="zabić/h" />);
    // the level axis: the tick labels in the lowest row
    const ticks = () => {
      const texts = [...container.querySelectorAll('text.recharts-cartesian-axis-tick-value')];
      const bottom = Math.max(...texts.map((t) => Number(t.getAttribute('y'))));
      return texts.filter((t) => Number(t.getAttribute('y')) === bottom).map((t) => Number(t.textContent));
    };
    expect(Math.min(...ticks())).toBe(40);
    const start = () => container.querySelectorAll('.recharts-brush-traveller')[0] as SVGElement;
    for (let i = 0; i < 5; i++) fireEvent.keyDown(start(), { key: 'ArrowRight' });
    expect(Math.min(...ticks())).toBe(45);
    fireEvent.mouseEnter(within(legend()).getByRole('button', { name: /^A / }));
    expect(Math.min(...ticks())).toBe(45);
  });
});

describe('TrendTooltip', () => {
  it('names the level and lists the builds best first with the distance to the leader', () => {
    render(<TrendTooltip series={two} levels={levels} level={41} slots={{ A: 0, B: 1 }} valueName="zabić/h" />);
    expect(screen.getByText('Level 41')).toBeTruthy();
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['120.0DEMOnajlepszy', '110.0AFF-8.3%']);
  });
  it('draws nothing for a level it does not have', () => {
    const { container } = render(<TrendTooltip series={two} levels={levels} level={99} slots={{}} valueName="x" />);
    expect(container.textContent).toBe('');
  });
});

describe('charts in the views', () => {
  const settings = { ...DEFAULT_SETTINGS, level: 41, sessions: 4 };
  const ranking = runJob({ kind: 'ranking', settings }) as RankingResult;

  const names = (root: Element) => [...root.querySelectorAll('text.fv-rank-name')].map((t) => t.textContent);
  const labels = (root: Element) => [...root.querySelectorAll('text.fv-rank-label')].map((t) => t.textContent);

  it('RankingChart: the ten best first, each with its kills per hour and the gap to the best', () => {
    const { container } = render(<RankingChart ranking={ranking} />);
    expect(screen.getByRole('figure', { name: /Ranking na wykresie/ })).toBeTruthy();
    expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(10);
    expect(names(container)).toHaveLength(10);
    expect(names(container)[0]).toContain(ranking.rows[0]!.metrics.variant);
    expect(labels(container)[0]).toBe(`${ranking.rows[0]!.metrics.killsPerHour.toFixed(1)}najlepszy`);
    expect(labels(container)[1]).toContain(ranking.rows[1]!.metrics.killsPerHour.toFixed(1));
    expect(labels(container)[1]).toContain(ranking.rows[1]!.vsBest!.mean.toFixed(1));
    for (const family of ['Affliction', 'Demonology i Fire']) expect(screen.getByText(family)).toBeTruthy();
  });

  it('RankingChart: shows all builds on request and hides them again', () => {
    const { container } = render(<RankingChart ranking={ranking} />);
    fireEvent.click(screen.getByRole('button', { name: `Pokaż wszystkie (${ranking.rows.length})` }));
    expect(names(container)).toHaveLength(ranking.rows.length);
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż 10 najlepszych' }));
    expect(names(container)).toHaveLength(10);
  });

  it('RankingChart: another metric', () => {
    const { container } = render(<RankingChart ranking={ranking} />);
    const select = screen.getByLabelText('Metryka rankingu') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'ttk' } });
    expect(screen.getByRole('figure', { name: /TTK/ })).toBeTruthy();
    expect(labels(container)[0]).toMatch(/^\d+\.\d s$/);
  });

  it('RankingChart: a checkbox next to every name ticks the build, by pointer or keyboard', () => {
    const [first, second] = ranking.rows.map((r) => r.metrics.variant) as [string, string];
    const toggled: string[] = [];
    render(<RankingChart ranking={ranking} selected={new Set([second])} onToggle={(id) => toggled.push(id)} />);
    const box = (id: string) => screen.getByRole('checkbox', { name: `Zaznacz na wykresie: ${id}` });
    expect(screen.getAllByRole('checkbox', { name: /^Zaznacz na wykresie:/ })).toHaveLength(10);
    expect(box(first).getAttribute('aria-checked')).toBe('false');
    expect(box(second).getAttribute('aria-checked')).toBe('true');
    expect(box(first).getAttribute('tabindex')).toBe('0');
    fireEvent.click(box(first));
    fireEvent.keyDown(box(second), { key: ' ' });
    fireEvent.keyDown(box(second), { key: 'Enter' });
    fireEvent.keyDown(box(second), { key: 'a' });
    expect(toggled).toEqual([first, second, second]);
  });

  it('RankingChart: without a way to tick there are no checkboxes', () => {
    render(<RankingChart ranking={ranking} />);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  const noop = () => {};
  const sim = (extra: Partial<Parameters<typeof SimView>[0]> = {}) => (
    <SimView run={{ status: 'done' } as unknown as ForeverRun} ranking={ranking} sweep={undefined} selected={new Set()} onSelect={noop} onSweep={noop} onOpenBuild={noop} {...extra} />
  );
  const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const tab = (name: 'Wykres' | 'Tabela') => within(screen.getByRole('group', { name: 'Widok rankingu' })).getByRole('button', { name });

  it('SimView: the ranking is shown as a chart or as a table, never both, so there is one set of checkboxes', () => {
    render(sim());
    expect(tab('Wykres').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('figure', { name: /Ranking na wykresie/ })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Ranking buildów' })).toBeNull();
    expect(screen.getAllByRole('checkbox').every((c) => c.getAttribute('aria-label')!.startsWith('Zaznacz na wykresie:'))).toBe(true);
    fireEvent.click(tab('Tabela'));
    expect(tab('Tabela').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('figure', { name: /Ranking na wykresie/ })).toBeNull();
    const table = screen.getByRole('table', { name: 'Ranking buildów' });
    expect(screen.getAllByRole('checkbox')).toHaveLength(ranking.rows.length);
    // the table is wider than the page: the column with the checkbox and the name stays in view
    const buildCells = [...table.querySelectorAll('tr > :nth-child(2)')];
    expect(buildCells).toHaveLength(ranking.rows.length + 1);
    expect(buildCells.every((c) => c.classList.contains('fv-sticky'))).toBe(true);
  });

  it('SimView: one bar above the list says how many builds are ticked and computes their curve', () => {
    const picked = new Set(ranking.rows.slice(0, 2).map((r) => r.metrics.variant));
    const swept: string[][] = [];
    const { rerender } = render(sim());
    const bar = () => screen.getByRole('group', { name: 'Zaznaczone buildy' });
    const curve = () => within(bar()).getByRole('button', { name: /^Krzywa 10–59 dla zaznaczonych/ }) as HTMLButtonElement;
    expect(bar().textContent).toContain('Zaznaczone: 0');
    expect(curve().disabled).toBe(true);
    expect(follows(bar(), screen.getByRole('figure', { name: /Ranking na wykresie/ }))).toBe(true);
    rerender(sim({ selected: picked, onSweep: (ids) => swept.push([...ids]) }));
    expect(bar().textContent).toContain('Zaznaczone: 2');
    expect(curve().textContent).toBe('Krzywa 10–59 dla zaznaczonych (2)');
    fireEvent.click(curve());
    expect(swept).toEqual([[...picked]]);
    for (const name of ['Zaznacz 5 najlepszych', 'Zaznacz wszystkie', 'Wyczyść']) expect(within(bar()).getByRole('button', { name })).toBeTruthy();
  });

  it('SimView: the curve section appears only when there is a curve', () => {
    const { rerender } = render(sim());
    expect(screen.queryByRole('region', { name: 'Krzywa po levelach' })).toBeNull();
    const sweep = runJob({ kind: 'sweep', settings, builds: ['DT_SS', 'DEMO_FIRE'] }) as SweepResult;
    rerender(sim({ sweep }));
    const section = screen.getByRole('region', { name: 'Krzywa po levelach' });
    expect(within(section).getByRole('figure', { name: /Zabicia na godzinę wg levelu/ })).toBeTruthy();
    // the counts of best and worst levels are folded away with the data
    expect(within(section).getByRole('table', { name: 'Ile razy najlepszy', hidden: true }).closest('details')).not.toBeNull();
  }, 30000);

  it('RankingChart: a click on a bar ticks the build', () => {
    const toggled: string[] = [];
    const { container } = render(<RankingChart ranking={ranking} onToggle={(id) => toggled.push(id)} />);
    fireEvent.click(container.querySelector('.recharts-bar-rectangle path') as Element);
    expect(toggled).toEqual([ranking.rows[0]!.metrics.variant]);
  });

  it('CompareView: the curves of both builds and the difference per level, for a chosen metric', () => {
    const duel = runJob({ kind: 'duel', settings, a: 'AFF_WRACK', b: 'DEMO_FIRE', sweep: true }) as DuelOutcome;
    render(<CompareView settings={settings} run={{ status: 'done' } as unknown as ForeverRun} duel={duel} onRun={() => {}} />);
    expect(screen.getByRole('figure', { name: /AFF_WRACK vs DEMO_FIRE: Zabić\/h/ })).toBeTruthy();
    expect(screen.getByRole('figure', { name: /Różnica A − B: Zabić\/h/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Metryka na wykresach'), { target: { value: 'ttk' } });
    expect(screen.getByRole('figure', { name: /Różnica A − B: TTK/ })).toBeTruthy();
    expect(screen.getByRole('table', { name: /^Dane: AFF_WRACK vs DEMO_FIRE: TTK/, hidden: true })).toBeTruthy();
  });

  it('EpChart: bars of the weights per stat and build', () => {
    const ep = runJob({ kind: 'ep', settings, builds: ['AFF_WRACK', 'DEMO_FIRE'] }) as EpOutcome;
    const { container } = render(<EpChart results={ep.results} />);
    expect(screen.getByRole('figure', { name: /Wagi statów/ })).toBeTruthy();
    expect(container.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick')).toHaveLength(5);
    expect(screen.getByText('AFF_WRACK')).toBeTruthy();
  });
});
