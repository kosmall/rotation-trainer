import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { destructionTalentString } from '../../src/data/classes/warlock/talents';
import { offeredTalentPresets, talentPresetById } from '../../src/data/classes/warlock/talentPresets';
import { decodeTalents, loadTalentDescriptions, TALENT_TREE, type TalentDescriptions } from '../../src/data/classes/warlock/talentTree';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG } from '../../src/setup/defaults';
import { SETUP_PRESETS } from '../../src/setup/presets';
import { SETUP_STORAGE_KEY, type SetupStorage } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { runSimulation, type SimRunner } from '../../src/sim-runner/client';
import { buildDestructionWarlock } from '../../src/data/classes/warlock/destruction';
import { runBot } from '../../src/bot/bot';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET, DEFAULT_DISTANCE_FROM_TARGET_YD } from '../../src/data/common/target';
import { Simulation } from '../../src/engine/sim';
import { applySetup } from '../../src/setup/applySetup';
import { STATIC_SETUP_CATALOG } from '../../src/setup/defaults';
import { GameView } from '../../src/ui/GameView';
import { TalentsPanel } from '../../src/ui/TalentsPanel';
import { readTalentImport } from '../../src/ui/talentView';

// Same fake clock as the Gear panel tests: fight time moves only through vi.advanceTimersByTime.
const FAKE_NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers({
    now: FAKE_NOW,
    toFake: ['Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const PRESETS = offeredTalentPresets();
const NIGHTFALL = talentPresetById('destro-nightfall')!;
const AFFLICTION = talentPresetById('affliction')!;
const ALL_TALENTS = TALENT_TREE.trees.flatMap((t) => t.talents);

/** A descriptions loader that resolves at once with a text per rank. */
function fakeDescriptions(): TalentDescriptions {
  const out: Record<string, readonly string[]> = {};
  for (const d of ALL_TALENTS) out[d.id] = Array.from({ length: d.maxRank }, (_, i) => `${d.name} rank ${i + 1} text.`);
  return out;
}

/** The panel, controlled by its own state, recording every emitted build. */
function Harness({
  initial = destructionTalentString,
  onEmit,
  loadDescriptions = () => Promise.resolve(fakeDescriptions()),
  warnings,
}: {
  initial?: string;
  onEmit?: (t: string) => void;
  loadDescriptions?: () => Promise<TalentDescriptions>;
  warnings?: string[];
}) {
  const [talents, setTalents] = useState(initial);
  return (
    <TalentsPanel
      talents={talents}
      presets={PRESETS}
      warnings={warnings}
      loadDescriptions={loadDescriptions}
      onChange={(t) => {
        onEmit?.(t);
        setTalents(t);
      }}
    />
  );
}

const panel = () => screen.getByText('Talents', { selector: 'summary' }).closest('details') as HTMLElement;

/** Opens the Talents panel (jsdom fires `toggle` late: fired here, as for the Simulator). */
function openTalents() {
  const summary = screen.getByText('Talents', { selector: 'summary' });
  fireEvent.click(summary);
  act(() => {
    fireEvent(summary.closest('details')!, new Event('toggle'));
  });
}

/** The talent button whose accessible name starts with "<name>, rank". */
const talent = (name: string) => within(panel()).getByRole('button', { name: new RegExp(`^${name}, rank `) });
const points = () => within(panel()).getByLabelText('Talent points').textContent;
const activeBuild = () => within(panel()).getByLabelText('Active talent build').textContent;
const status = () => within(panel()).getByRole('status', { name: 'Talent editor status' }).textContent;
const presetButton = (name: string) => within(within(panel()).getByRole('group', { name: 'Talent presets' })).getByRole('button', { name });

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const storage: SetupStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
  return { storage, map };
}
const stored = (map: Map<string, string>): SetupConfig => JSON.parse(map.get(SETUP_STORAGE_KEY) ?? 'null') as SetupConfig;

describe('Talents panel (tree editor)', () => {
  it("renders three trees with 64 talents and the author's ranks; heavy content only while open", () => {
    render(<Harness />);
    expect(within(panel()).queryAllByRole('button').length).toBe(0); // closed: nothing heavy rendered
    openTalents();
    for (const name of ['Affliction', 'Demonology', 'Destruction']) {
      expect(within(panel()).getByRole('group', { name: `${name} tree` })).toBeTruthy();
    }
    const buttons = within(panel()).getAllByRole('button', { name: /, rank \d+ of \d+/ });
    expect(buttons).toHaveLength(64);
    expect(talent('Bane').getAttribute('aria-label')).toBe('Bane, rank 5 of 5, full rank');
    expect(talent('Emberstorm').textContent).toContain('3/5');
    expect(points()).toBe('0 / 21 / 40 · 0 left');
    expect(activeBuild()).toBe('My build (export)');
    expect(presetButton('My build (export)').getAttribute('aria-pressed')).toBe('true');
    // Grid placement from the data (1-based CSS lines).
    expect(talent('Conflagrate').style.getPropertyValue('--talent-row')).toBe('7');
    expect(talent('Conflagrate').style.getPropertyValue('--talent-col')).toBe('2');
  });

  it('clicking adds a point and updates the counters; a locked talent shows its reason and does nothing', () => {
    const emitted: string[] = [];
    render(<Harness onEmit={(t) => emitted.push(t)} />);
    openTalents();
    // All 61 points spent: Improved Immolate is locked.
    expect(talent('Improved Immolate').getAttribute('aria-label')).toBe(
      'Improved Immolate, rank 0 of 5, locked: All 61 talent points are spent.',
    );
    fireEvent.click(talent('Improved Immolate'));
    expect(emitted).toHaveLength(0);
    expect(status()).toBe('All 61 talent points are spent.');

    fireEvent.contextMenu(talent('Emberstorm')); // Shadow and Flame needs it (35 points above row 8)
    expect(status()).toBe('Shadow and Flame needs 35 points in Destruction rows above it: Emberstorm is one of them.');
    fireEvent.contextMenu(talent('Shadow and Flame')); // right click removes
    expect(points()).toBe('0 / 21 / 39 · 1 left');
    expect(status()).toBe('Removed a point from Shadow and Flame (4/5).');
    fireEvent.click(talent('Improved Immolate'));
    expect(points()).toBe('0 / 21 / 40 · 0 left');
    expect(talent('Improved Immolate').getAttribute('aria-label')).toMatch(/^Improved Immolate, rank 1 of 5/);
    expect(emitted.at(-1)).toBe(decodeTalentsString(emitted.at(-1)!));
    expect(activeBuild()).toBe('Custom');
    expect(within(panel()).getByRole('button', { name: 'Reset to my build' })).toBeTruthy();
  });

  it('prerequisite and row blocks: Conflagrate needs Improved Immolate at full rank; an Affliction row 2 talent needs 5 points', () => {
    render(<Harness />);
    openTalents();
    fireEvent.contextMenu(talent('Shadow and Flame'));
    expect(talent('Conflagrate').getAttribute('aria-label')).toBe(
      'Conflagrate, rank 0 of 1, locked: Conflagrate needs Improved Immolate at full rank (0/5).',
    );
    fireEvent.click(talent('Conflagrate'));
    expect(status()).toBe('Conflagrate needs Improved Immolate at full rank (0/5).');
    fireEvent.click(talent('Improved Life Tap'));
    expect(status()).toBe('Improved Life Tap needs 5 points in Affliction rows above it (has 0).');
    expect(points()).toBe('0 / 21 / 39 · 1 left');
    // A prerequisite marker joins Conflagrate to Improved Immolate.
    expect(panel().querySelector('[data-prereq="improvedImmolate:conflagrate"]')).not.toBeNull();
  });

  it('removing a supporting point is blocked with a message', () => {
    const emitted: string[] = [];
    render(<Harness onEmit={(t) => emitted.push(t)} />);
    openTalents();
    fireEvent.contextMenu(talent('Devastation'));
    expect(status()).toBe('Ruin depends on Devastation at full rank.');
    fireEvent.contextMenu(talent('Improved Shadow Bolt'));
    expect(status()).toMatch(/needs \d+ points in Destruction rows above it: Improved Shadow Bolt is one of them\./);
    expect(emitted).toHaveLength(0);
  });

  it('keyboard and touch: Shift+Enter removes, the details card has − and + buttons; Space on a talent never starts a fight', () => {
    render(<Harness />);
    openTalents();
    const flame = talent('Shadow and Flame');
    flame.focus();
    fireEvent.focus(flame);
    fireEvent.keyDown(flame, { key: 'Enter', shiftKey: true });
    expect(points()).toBe('0 / 21 / 39 · 1 left');
    const card = within(panel()).getByRole('region', { name: 'Talent details' });
    expect(within(card).getByText('Shadow and Flame')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Remove a point from Shadow and Flame' }));
    expect(points()).toBe('0 / 21 / 38 · 2 left');
    fireEvent.click(within(card).getByRole('button', { name: 'Add a point to Shadow and Flame' }));
    expect(points()).toBe('0 / 21 / 39 · 1 left');
  });

  it('presets: aria-pressed by deep equality, Custom otherwise; Reset restores the author build', () => {
    render(<Harness />);
    openTalents();
    fireEvent.click(presetButton('Destro/Nightfall'));
    expect(activeBuild()).toBe('Destro/Nightfall');
    expect(presetButton('Destro/Nightfall').getAttribute('aria-pressed')).toBe('true');
    expect(presetButton('My build (export)').getAttribute('aria-pressed')).toBe('false');
    expect(points()).toBe(`${decodeTalents(NIGHTFALL.talents).points.join(' / ')} · 0 left`);
    fireEvent.contextMenu(talent('Shadowfury'));
    expect(activeBuild()).toBe('Custom');
    expect(within(panel()).queryAllByRole('button', { pressed: true })).toHaveLength(0);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Reset to my build' }));
    expect(activeBuild()).toBe('My build (export)');
  });

  it('unmodelled markers and the modelled/unmodelled summary; rotation warnings shown', () => {
    render(<Harness warnings={['Shadowburn finisher: Shadowburn is not available with these talents; the step is skipped.']} />);
    openTalents();
    expect(talent('Intensity').getAttribute('aria-label')).toBe('Intensity, rank 2 of 2, not modelled, full rank');
    expect(talent('Intensity').className).toContain('talent-unmodelled');
    const list = within(panel()).getByRole('list', { name: 'Not modelled talents in this build' });
    expect(within(list).getByText(/^Intensity 2\/2:/)).toBeTruthy();
    expect(within(panel()).getByLabelText('Modelled talents').textContent).toMatch(/^Modelled: \d+ of 61 points; not modelled: \d+\.$/);
    expect(within(within(panel()).getByRole('list', { name: 'Rotation warnings' })).getByText(/Shadowburn is not available/)).toBeTruthy();
  });

  it('import: a bare string and a WowSimsExporter export apply; invalid and hostile text never applies and lists the violations', () => {
    const emitted: string[] = [];
    render(<Harness onEmit={(t) => emitted.push(t)} />);
    openTalents();
    const area = () => within(panel()).getByRole('textbox', { name: 'Talent import' });
    const apply = () => within(panel()).getByRole('button', { name: 'Apply talents' }) as HTMLButtonElement;
    expect(apply().disabled).toBe(true);

    fireEvent.change(area(), { target: { value: '9-9-9' } });
    expect(apply().disabled).toBe(true);
    const report = within(panel()).getByRole('region', { name: 'Talent import report' });
    expect(within(report).getAllByRole('listitem').length).toBeGreaterThan(0);
    // One header for every refusal (format errors and missing strings are not "rule" breaks).
    expect(report.textContent).toContain('Not applied: this is not a valid talent build.');

    for (const hostile of ['{"__proto__":{"talents":"1"}}', '{"talents":{"toString":1}}', 'x'.repeat(300_000), '<img src=x onerror=alert(1)>', '[]', '{"class":"Mage","talents":"-20500301332101-50500051220051053105"}']) {
      fireEvent.change(area(), { target: { value: hostile } });
      expect(apply().disabled).toBe(true);
    }
    expect(document.querySelector('img[src="x"]')).toBeNull();

    fireEvent.change(area(), { target: { value: '  -20500301332101-50500051220051053105 ' } });
    expect(apply().disabled).toBe(false);
    fireEvent.click(apply());
    expect(activeBuild()).toBe('Destruction');
    expect(emitted.at(-1)).toBe(talentPresetById('destruction')!.talents);
    expect(status()).toMatch(/^Imported:/);
    expect((area() as HTMLTextAreaElement).value).toBe('');

    fireEvent.change(area(), { target: { value: JSON.stringify({ class: 'Warlock', race: 'Gnome', talents: AFFLICTION.wowsimsString }) } });
    fireEvent.click(apply());
    expect(activeBuild()).toBe('Affliction');
  });

  it('readTalentImport never throws on hostile input', () => {
    for (const t of ['', ' ', '{', '{"talents":null}', 'null', '1-2', '-'.repeat(199), '\u0000-\u0000-\u0000', '﻿{"talents":"--"}']) {
      expect(() => readTalentImport(t)).not.toThrow();
    }
    expect(readTalentImport('')).toBeNull();
    expect(readTalentImport('﻿{"talents":"--"}')).toEqual({ ok: true, talents: decodeTalentsString('--') });
  });

  it('export round trip: the export text imports to the same build; Copy uses a guarded clipboard', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<Harness initial={NIGHTFALL.talents} />);
    openTalents();
    const exported = (within(panel()).getByRole('textbox', { name: 'Talent string' }) as HTMLTextAreaElement).value;
    expect(exported).toBe(NIGHTFALL.talents);
    expect(readTalentImport(exported)).toEqual({ ok: true, talents: NIGHTFALL.talents });
    await act(async () => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Copy talent string' }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(NIGHTFALL.talents);
    expect(within(panel()).getByText(/press Ctrl\+C|Copied\./)).toBeTruthy();
  });

  it('typing in the textarea never triggers hotkeys', () => {
    render(<GameView storage={null} />);
    openTalents();
    const area = within(panel()).getByRole('textbox', { name: 'Talent import' });
    for (const key of ['1', '2', ' ', 'r', 'z', '-', '=']) fireEvent.keyDown(area, { key });
    expect(screen.queryByRole('progressbar', { name: 'Cast bar' })).toBeNull();
    expect(screen.getByRole('button', { name: /^start the fight$/i })).toBeTruthy();
    // Space and Enter on a focused talent button belong to it.
    fireEvent.keyDown(talent('Bane'), { key: ' ' });
    fireEvent.keyDown(talent('Bane'), { key: 'Enter' });
    expect(screen.getByRole('button', { name: /^start the fight$/i })).toBeTruthy();
  });

  it('descriptions load lazily: only when the panel opens; loading and failed states, then current and next rank texts', async () => {
    let resolve!: (d: TalentDescriptions) => void;
    let reject!: (e: unknown) => void;
    const loader = vi.fn(
      () =>
        new Promise<TalentDescriptions>((res, rej) => {
          resolve = res;
          reject = rej;
        }),
    );
    render(<Harness loadDescriptions={loader} />);
    expect(loader).not.toHaveBeenCalled();
    openTalents();
    expect(loader).toHaveBeenCalledTimes(1);
    fireEvent.mouseEnter(talent('Emberstorm'));
    const card = () => within(panel()).getByRole('region', { name: 'Talent details' });
    expect(within(card()).getByText('Loading the description…')).toBeTruthy();
    await act(async () => {
      reject(new Error('offline'));
      await Promise.resolve();
    });
    expect(within(card()).getByText(/could not load/)).toBeTruthy();
    fireEvent.click(within(card()).getByRole('button', { name: 'Try again' }));
    expect(loader).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolve(fakeDescriptions());
      await Promise.resolve();
    });
    expect(within(card()).getByText('Emberstorm rank 3 text.')).toBeTruthy();
    expect(within(card()).getByText('Emberstorm rank 4 text.')).toBeTruthy();
    fireEvent.mouseEnter(talent('Intensity'));
    expect(within(card()).getByText(/^Not modelled:/)).toBeTruthy();
  });

  it('the real descriptions file loads and has every talent', async () => {
    vi.useRealTimers();
    const d = await loadTalentDescriptions();
    expect(Object.keys(d)).toHaveLength(64);
  });
});

/** The full-width form of a talent string. */
function decodeTalentsString(text: string): string {
  const r = readTalentImport(text);
  if (!r || !r.ok) throw new Error(`invalid ${text}`);
  return r.talents;
}

describe('Talents in the game (wiring)', () => {
  it('stored talents round trip; corrupt stored talents fall back to the author build', () => {
    const { storage, map } = memoryStorage();
    render(<GameView storage={storage} />);
    openTalents();
    fireEvent.click(presetButton('Affliction'));
    expect(stored(map).talents).toBe(AFFLICTION.talents);
    cleanup();
    render(<GameView storage={storage} />);
    openTalents();
    expect(activeBuild()).toBe('Affliction');
    cleanup();

    for (const bad of ['9-9-9', 'x'.repeat(500), 42, { a: 1 }]) {
      const s = memoryStorage({ [SETUP_STORAGE_KEY]: JSON.stringify({ ...DEFAULT_SETUP, talents: bad }) });
      render(<GameView storage={s.storage} />);
      openTalents();
      expect(activeBuild()).toBe('My build (export)');
      cleanup();
    }
    // Back to the author's build: stored as no field.
    render(<GameView storage={storage} />);
    openTalents();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Reset to my build' }));
    expect(stored(map).talents).toBeUndefined();
  });

  it('a fight that started keeps its talents until R; Conflagrate appears on slot 8 after the next fight and casts', () => {
    render(<GameView storage={null} />);
    expect(screen.getByLabelText('Empty slot (8)')).toBeTruthy();
    fireEvent.keyDown(window, { key: '1' }); // the fight starts
    openTalents();
    fireEvent.click(presetButton('Destro/Nightfall'));
    expect(within(panel()).getByText(/running fight keeps its talents/)).toBeTruthy();
    expect(screen.getByLabelText('Empty slot (8)')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'r' });
    expect(screen.getByRole('button', { name: 'Conflagrate (8)' })).toBeTruthy();
    expect(within(panel()).queryByText(/running fight keeps its talents/)).toBeNull();
    // Immolate (2), then Conflagrate (8) once Immolate's DoT is up.
    fireEvent.keyDown(window, { key: '2' });
    advance(2500);
    fireEvent.keyDown(window, { key: '8' });
    advance(100);
    // Cast: Conflagrate's 10 s cooldown runs on its slot (a rejected press would flash a reason instead).
    expect(screen.getByRole('button', { name: 'Conflagrate (8)' }).querySelector('.slot-cooldown')).not.toBeNull();
  });

  it('a not-started fight takes a new build at once; the stats at the pull follow the build', () => {
    render(<GameView storage={null} />);
    const before = screen.getByLabelText('Shadow Bolt crit').textContent;
    openTalents();
    fireEvent.click(presetButton('Destro/Nightfall'));
    expect(screen.getByRole('button', { name: 'Conflagrate (8)' })).toBeTruthy();
    expect(within(panel()).queryByText(/running fight keeps its talents/)).toBeNull();
    fireEvent.click(presetButton('Affliction')); // no Devastation: a lower Shadow Bolt crit
    expect(screen.getByLabelText('Shadow Bolt crit').textContent).not.toBe(before);
    expect(screen.getByLabelText('Empty slot (8)')).toBeTruthy();
  });

  it('GameView forwards the talents to buildSpec', () => {
    const calls: unknown[] = [];
    const spy = (...args: Parameters<typeof buildDestructionWarlock>) => {
      calls.push(args[3]);
      return buildDestructionWarlock(...args);
    };
    render(<GameView storage={null} buildSpec={spy} />);
    openTalents();
    fireEvent.click(presetButton('Destro/Nightfall'));
    expect(calls).toContain(NIGHTFALL.talents);
  });

  it('a Setup preset keeps the talents; Reset to defaults restores the author build; preset matching ignores kept talents', () => {
    const { storage, map } = memoryStorage();
    render(<GameView storage={storage} />);
    openTalents();
    fireEvent.click(presetButton('Destro/Nightfall'));
    expect(screen.getByLabelText('Active preset').textContent).toBe('None');
    fireEvent.click(screen.getByRole('button', { name: SETUP_PRESETS['raid-log'].name }));
    expect(stored(map).talents).toBe(NIGHTFALL.talents);
    expect(screen.getByLabelText('Active preset').textContent).toBe(SETUP_PRESETS['raid-log'].name);
    expect(activeBuild()).toBe('Destro/Nightfall');
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(stored(map).talents).toBeUndefined();
    expect(activeBuild()).toBe('My build (export)');
    expect(stored(map)).toEqual(normalizeSetup(DEFAULT_SETUP, SETUP_CATALOG));
  });

  it("the Simulator plays the setup's talents and labels the result with the talent preset", async () => {
    const requests: SetupConfig[] = [];
    const runner: SimRunner = async (request, options) => {
      requests.push(structuredClone(request.setup));
      return runSimulation(request, options);
    };
    render(<GameView storage={null} simRunner={runner} />);
    openTalents();
    fireEvent.click(presetButton('Destro/Nightfall'));
    const summary = screen.getByText('Simulator', { selector: 'summary' });
    fireEvent.click(summary);
    act(() => {
      fireEvent(summary.closest('details')!, new Event('toggle'));
    });
    const sim = summary.closest('details') as HTMLElement;
    fireEvent.change(within(sim).getByRole('spinbutton', { name: 'Runs' }), { target: { value: '2' } });
    fireEvent.blur(within(sim).getByRole('spinbutton', { name: 'Runs' }));
    fireEvent.click(within(sim).getByRole('button', { name: 'Run' }));
    for (let i = 0; i < 200 && within(sim).queryByRole('button', { name: 'Cancel' }) !== null; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
    }
    expect(requests[0]?.talents).toBe(NIGHTFALL.talents);
    expect(within(sim).getByText('Talents: Destro/Nightfall')).toBeTruthy();
  });

  it('golden values: the default setup, built the way GameView builds it, still gives 1425.1766666666667 / 1428.3350000000003', () => {
    const fight = applySetup({
      buildSpec: (w, g, t) => buildDestructionWarlock(w, g, undefined, t),
      catalog: STATIC_SETUP_CATALOG,
      config: normalizeSetup({ ...DEFAULT_SETUP, talents: destructionTalentString }, SETUP_CATALOG),
    });
    const mean = (w: number) =>
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        .map(
          (seed) =>
            runBot(
              new Simulation({ spec: fight.spec, target: BOSS_TARGET, seed, spellQueueWindowMs: w, distanceFromTarget: DEFAULT_DISTANCE_FROM_TARGET_YD }),
              fight.spec.priority,
            ).dps,
        )
        .reduce((a, b) => a + b, 0) / 10;
    expect(mean(SPELL_QUEUE_WINDOW_MS)).toBe(1425.1766666666667);
    expect(mean(0)).toBe(1428.3350000000003);
  });
});
