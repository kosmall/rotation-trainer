// Report → Timeline: the cursor and "Moment by moment" (fight timeline and key fights Task K3; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 C, D, §3): the
// cursor on the lanes, the DPS chart and the scrubber (arrows ±1 s, Shift ±5 s, Home/End, "Go to"),
// the panel of second N from the log (damage per spell, casts, queue, items, mana gains, aura
// changes, the auras up at its start), the bot's row, the jumps, the virtual list of all seconds
// with its filters, the copy buttons, and the render budget (moving the cursor re-renders only the
// rows that change).

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBot } from '../../../src/bot/bot';
import { SPELL_QUEUE_WINDOW_MS } from '../../../src/data/common/ratings';
import { itemDbSync } from '../../../src/data/items/dbSync';
import { setupCatalogFor } from '../../../src/setup/defaults';
import { setupGear } from '../../../src/setup/gear';
import type { SetupConfig } from '../../../src/setup/types';
import { createFightSimulation } from '../../../src/sim-runner/fight';
import { formatInt } from '../../../src/ui/format';
import { buildReportModel, chipLabelsOf, fightFromLast, replaySimFight } from '../../../src/ui/report/reportModel';
import type { ReportModel } from '../../../src/ui/report/reportModel';
import { eventJumps, secondsCsv, secondText, stateAt } from '../../../src/ui/report/secondsModel';
import { TimelineTab } from '../../../src/ui/report/TimelineTab';
import type { LastFight, NextFight } from '../../../src/ui/state/TrainerProvider';
import { applyScenario, scenarios } from '../../fixtures/item-use-reference';

const db = itemDbSync();

type Counts = { __RENDER_COUNTS__?: Record<string, number> };
const counts = () => (globalThis as Counts).__RENDER_COUNTS__ ?? {};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function nextFightOf(config: SetupConfig): NextFight {
  return { config, catalog: setupCatalogFor(setupGear(config), db), ...applyScenario(config, db) };
}

/** A fight played by the bot as if by the player (a played fight: the bot's row is shown). */
function playedModel(config: SetupConfig, seed: number): ReportModel {
  const fight = nextFightOf(config);
  const sim = createFightSimulation(fight, seed, SPELL_QUEUE_WINDOW_MS);
  runBot(sim, fight.spec.priority);
  const last: LastFight = { id: 1, log: sim.log(), snapshot: sim.snapshot(), config, labels: chipLabelsOf(config, fight.catalog), seed, fight };
  return buildReportModel(fightFromLast(last));
}

/** A simulation's typical fight (no bot row: it is the bot's own fight). */
function simModel(config: SetupConfig): ReportModel {
  const fight = replaySimFight({ result: { runs: 4, seed: 777, spellQueueWindowMs: SPELL_QUEUE_WINDOW_MS, meanDps: 1000, stdDev: 50 }, config }, 2, 'sim-typical', 'sim:1:typical', db);
  return buildReportModel(fight);
}

const raidLog = () => playedModel(scenarios().raidLog!, 9001);

const slider = () => screen.getByRole('slider', { name: 'Second' }) as HTMLInputElement;
const panel = () => screen.getByRole('region', { name: 'This second' });
const heading = () => within(panel()).getByRole('heading', { level: 3 });
const numberOf = (text: string | null) => Number((text ?? '').replace(/[^0-9.]/g, ''));

describe('Moment by moment: the cursor', () => {
  it('starts at second 0; the scrubber moves ±1 s with the arrows, ±5 s with Shift, Home and End', () => {
    const model = raidLog();
    render(<TimelineTab model={model} />);
    const last = model.seconds.length - 1;
    expect(slider().value).toBe('0');
    expect(slider().getAttribute('aria-valuetext')).toBe(`Second 0 of ${last}`);
    expect(heading().textContent).toMatch(/^Second 0 /);
    fireEvent.keyDown(slider(), { key: 'ArrowRight' });
    expect(slider().value).toBe('1');
    fireEvent.keyDown(slider(), { key: 'ArrowRight', shiftKey: true });
    expect(slider().value).toBe('6');
    fireEvent.keyDown(slider(), { key: 'ArrowLeft', shiftKey: true });
    expect(slider().value).toBe('1');
    fireEvent.keyDown(slider(), { key: 'End' });
    expect(slider().value).toBe(String(last));
    fireEvent.keyDown(slider(), { key: 'ArrowRight' });
    expect(slider().value).toBe(String(last));
    fireEvent.keyDown(slider(), { key: 'Home' });
    expect(slider().value).toBe('0');
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' });
    expect(slider().value).toBe('0');
    fireEvent.change(slider(), { target: { value: '17' } });
    expect(heading().textContent).toMatch(/^Second 17 /);
  });

  it('"Go to" takes a time in seconds (12.4 s is second 12) and clamps to the fight', () => {
    const model = raidLog();
    render(<TimelineTab model={model} />);
    const field = screen.getByRole('textbox', { name: 'Go to (s)' });
    fireEvent.change(field, { target: { value: '12.4' } });
    fireEvent.submit(field.closest('form')!);
    expect(slider().value).toBe('12');
    fireEvent.change(field, { target: { value: '9999' } });
    fireEvent.submit(field.closest('form')!);
    expect(slider().value).toBe(String(model.seconds.length - 1));
    fireEvent.change(field, { target: { value: 'soon' } });
    fireEvent.submit(field.closest('form')!);
    expect(slider().value).toBe(String(model.seconds.length - 1));
    expect(screen.getByText('Type a time in seconds, e.g. 12.4.')).toBeTruthy();
  });

  it('a click on the lanes or on the DPS chart sets the second; both draw the cursor', () => {
    const model = raidLog();
    render(<TimelineTab model={model} />);
    const lanes = screen.getByRole('img', { name: /Casts and auras over the fight/ });
    // jsdom: no layout, the charts are drawn 640 px wide; the lanes' plot starts at 180 px and is 448 px wide.
    fireEvent.click(lanes, { clientX: 180 + 448 / 2, clientY: 10 });
    expect(slider().value).toBe(String(Math.floor(model.durationMs / 2 / 1000)));
    expect(lanes.querySelector('.cursor')).not.toBeNull();
    const chart = screen.getByRole('img', { name: /DPS over time/ });
    // The line chart's plot starts at 52 px and is 576 px wide.
    fireEvent.click(chart, { clientX: 52 + 576 / 4, clientY: 100 });
    expect(slider().value).toBe(String(Math.floor(model.durationMs / 4 / 1000)));
    expect(chart.querySelector('.cursor')).not.toBeNull();
  });
});

describe('Moment by moment: the panel of a second', () => {
  it('shows the damage per spell (sums to the second), casts, aura changes and the auras up at its start, from the log', () => {
    const model = raidLog();
    render(<TimelineTab model={model} />);
    // A second with damage and an aura change.
    const b = model.seconds.find((s) => s.damage > 0 && s.auras.length > 0 && s.second > 0)!;
    fireEvent.change(slider(), { target: { value: String(b.second) } });
    const p = panel();
    expect(within(p).getByLabelText('Damage in this second').textContent).toBe(formatInt(b.damage));
    const table = within(p).getByRole('table', { name: 'Damage in this second, per spell' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(b.spells.length);
    expect(rows.reduce((sum, r) => sum + numberOf(r.querySelectorAll('td')[0]!.textContent), 0)).toBe(b.damage);
    expect(within(table).getByRole('rowheader', { name: new RegExp(model.name(b.spells[0]!.spellId).name) })).toBeTruthy();
    const changes = within(p).getByRole('list', { name: 'Aura changes' });
    expect(within(changes).getAllByRole('listitem')).toHaveLength(b.auras.length);
    // The auras up at the start of the second (stateAt), with their remaining time.
    const state = stateAt(model.last.log, b.startMs, model.durationMs, model.ids);
    const yours = within(p).getByRole('list', { name: 'Your buffs at the start' });
    expect(within(yours).queryAllByRole('listitem')).toHaveLength(state.self.length);
    const target = within(p).getByRole('list', { name: 'On the target at the start' });
    expect(within(target).queryAllByRole('listitem')).toHaveLength(state.target.length);
    if (state.self[0] !== undefined) {
      expect(within(yours).getAllByRole('listitem')[0]!.textContent).toContain(`${(state.self[0].remainingMs / 1000).toFixed(1)} s`);
    }
  });

  it('shows item uses, mana gains (no mana at the end of a second: the log does not have it) and queue drops', () => {
    const model = raidLog();
    render(<TimelineTab model={model} />);
    const item = model.seconds.find((s) => s.items.length > 0)!;
    expect(item).toBeDefined();
    fireEvent.change(slider(), { target: { value: String(item.second) } });
    const used = within(panel()).getByRole('list', { name: 'Items used' });
    expect(used.textContent).toContain(model.name(item.items[0]!.spellId).name);
    const mana = model.seconds.find((s) => s.manaGained > 0)!;
    fireEvent.change(slider(), { target: { value: String(mana.second) } });
    expect(within(panel()).getByLabelText('Mana gained').textContent).toBe(`+${formatInt(mana.manaGained)}`);
    expect(screen.getByText(/mana at the end of a second is not in the log/i)).toBeTruthy();
  });

  it('a played fight shows the bot’s row of the same second; a simulation’s fight has none', () => {
    const model = raidLog();
    render(<TimelineTab model={model} />);
    expect(within(panel()).getByText(/^Bot:/)).toBeTruthy();
    cleanup();
    render(<TimelineTab model={simModel(scenarios().raidLog!)} />);
    expect(within(panel()).queryByText(/^Bot:/)).toBeNull();
  });

  it('the jump buttons go to the next and previous second with an aura change, an item use, a crit', () => {
    const model = raidLog();
    render(<TimelineTab model={model} />);
    const jumps = eventJumps(model.seconds);
    const group = screen.getByRole('group', { name: 'Jump to' });
    fireEvent.click(within(group).getByRole('button', { name: 'Next item use' }));
    expect(slider().value).toBe(String(jumps.item[0]));
    fireEvent.click(within(group).getByRole('button', { name: 'Next aura change' }));
    expect(slider().value).toBe(String(jumps.aura.find((s) => s > jumps.item[0]!)));
    const now = Number(slider().value);
    fireEvent.click(within(group).getByRole('button', { name: 'Previous crit' }));
    expect(slider().value).toBe(String([...jumps.crit].reverse().find((s) => s < now)));
    // Nothing before second 0.
    fireEvent.keyDown(slider(), { key: 'Home' });
    expect((within(group).getByRole('button', { name: 'Previous aura change' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Copy This Second and Copy Fight Log (CSV) put the model’s text on the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const model = raidLog();
    render(<TimelineTab model={model} />);
    fireEvent.change(slider(), { target: { value: '3' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy This Second' }));
    });
    const name = (id: string) => model.name(id).name;
    expect(writeText).toHaveBeenLastCalledWith(secondText(model.seconds[3]!, name));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Fight Log (CSV)' }));
    });
    expect(writeText).toHaveBeenLastCalledWith(secondsCsv(model.seconds, name));
    expect(screen.getByText('Copied.')).toBeTruthy();
  });
});

describe('Moment by moment: all seconds', () => {
  it('a virtual list: a 300 s fight keeps at most 60 rows in the DOM; a click on a row sets the cursor', () => {
    const model = playedModel(scenarios().long300!, 31);
    expect(model.seconds.length).toBe(300);
    render(<TimelineTab model={model} />);
    const table = screen.getByRole('table', { name: 'All seconds' });
    expect(table.getAttribute('aria-rowcount')).toBe('301');
    const bodyRows = () => table.querySelectorAll('[role="row"]:not([aria-rowindex="1"])');
    expect(bodyRows().length).toBeLessThanOrEqual(60);
    const scroller = table.querySelector('.sec-scroll') as HTMLElement;
    scroller.scrollTop = 36 * 200;
    fireEvent.scroll(scroller);
    expect(bodyRows().length).toBeLessThanOrEqual(60);
    fireEvent.click(within(table).getByRole('button', { name: '205 s' }));
    expect(slider().value).toBe('205');
    expect(within(table).getByRole('button', { name: '205 s' }).getAttribute('aria-current')).toBe('true');
    // Each row: the second's damage and the DPS so far.
    const row = within(table).getByRole('button', { name: '205 s' }).closest('[role="row"]')!;
    expect(row.textContent).toContain(formatInt(model.seconds[205]!.damage));
  });

  it('filters: only seconds with item uses, then a search by spell name', () => {
    const model = raidLog();
    render(<TimelineTab model={model} />);
    const table = screen.getByRole('table', { name: 'All seconds' });
    const shown = () => Number(table.getAttribute('aria-rowcount')) - 1;
    expect(shown()).toBe(model.seconds.length);
    fireEvent.click(within(screen.getByRole('group', { name: 'Show seconds with' })).getByRole('button', { name: 'Items' }));
    expect(shown()).toBe(model.seconds.filter((s) => s.items.length > 0).length);
    fireEvent.click(within(screen.getByRole('group', { name: 'Show seconds with' })).getByRole('button', { name: 'Items' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a spell or aura' }), { target: { value: 'doom' } });
    expect(shown()).toBeGreaterThan(0);
    expect(shown()).toBeLessThan(model.seconds.length);
    expect(screen.getByText(new RegExp(`^Showing ${shown()} of ${model.seconds.length} seconds`))).toBeTruthy();
  });

  it('render budget: a step of the cursor re-renders the list’s changed rows only, not the whole list', () => {
    const model = raidLog();
    render(<TimelineTab model={model} />);
    fireEvent.change(slider(), { target: { value: '5' } });
    const before = { ...counts() };
    fireEvent.keyDown(slider(), { key: 'ArrowRight' });
    const after = counts();
    expect((after.SecondRow ?? 0) - (before.SecondRow ?? 0)).toBeLessThanOrEqual(2);
    expect((after.SecondsFilter ?? 0) - (before.SecondsFilter ?? 0)).toBe(0);
  });
});

describe('Review: the seconds recomputed independently from the raw log', () => {
  // A second computed here without secondsModel: floor(atMs / 1000), pre-pull in 0, the end in the last.
  const cases: [string, () => ReportModel][] = [
    ['default, played', () => playedModel(scenarios().default!, 11)],
    ['raid-log, played', () => playedModel(scenarios().raidLog!, 12)],
    ['long300 with item rules, played', () => playedModel(scenarios().long300!, 13)],
    ['raid-log, a simulation’s key fight', () => simModel(scenarios().raidLog!)],
  ];
  for (const [label, make] of cases) {
    it(`${label}: damage, casts, item uses and mana per second equal the model; totals equal the fight`, () => {
      const model = make();
      const n = Math.ceil(model.durationMs / 1000);
      expect(model.seconds).toHaveLength(n);
      const at = (ms: number) => Math.min(n - 1, Math.max(0, Math.floor(ms / 1000)));
      const damage = new Array<number>(n).fill(0);
      const completes = new Array<number>(n).fill(0);
      const mana = new Array<number>(n).fill(0);
      for (const e of model.last.log) {
        const k = at(e.atMs);
        if (e.type === 'damage' || e.type === 'tick') damage[k]! += e.amount ?? 0;
        else if (e.type === 'cast-complete') completes[k]! += 1;
        else if (e.type === 'mana') mana[k]! += e.amount ?? 0;
      }
      model.seconds.forEach((b, k) => {
        expect(b.damage).toBe(damage[k]);
        expect(b.casts.filter((c) => c.kind === 'complete').length + b.items.length).toBe(completes[k]);
        expect(b.manaGained).toBe(mana[k]);
      });
      const total = damage.reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(model.last.snapshot.damageTotal, 6);
      expect(model.seconds.at(-1)!.cumulativeDps).toBeCloseTo(model.last.snapshot.dps, 9);
      expect(model.totals.damage).toBeCloseTo(total, 6);
    });
  }
});
