import { describe, expect, it } from 'vitest';
import { loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { simulatePull, type PullConfig } from '../../src/forever/fight';
import { getSpell, rankAt } from '../../src/forever/spells';
import type { Params } from '../../src/forever/types';

// Wrack, checked against:
// - Wowhead Forever spell 1316697: "Periodic Damage. Value: 25 every 1 second (SP mod: 0.2002)", 6 s channel, 200 mana.
// - warcraft.wiki.gg/wiki/Wrack tooltip: "inflicting 60 Shadow damage every 1 sec" (level 60).
// - Blizzard hotfix notes 10 Nov 2026: "Wrack speeds up how often your periodic effects deal damage, not how long they
//   last. Bane of Agony still lasts its full 24 seconds, but while Wrack is channeled on the target, it deals damage
//   twice as often." and "if you channel Wrack for 1 second during a 3-second Corruption tick, Corruption advances
//   2 seconds instead of 1, so its next tick lands 1 second later instead of 2, even if you stopped channeling Wrack."

const cfg = (id: string, level = 50, over: Partial<PullConfig> = {}, params: Partial<Params> = {}): PullConfig => ({
  variant: loadVariant(id), level, profile: 'average', params: loadParams({ mob_hp_mult: 4, ...params }), trace: true, mobs: 1, ...over,
});

interface Ev { t: number; text: string }
const parse = (trace: string[]): Ev[] => trace.map((l) => {
  const i = l.indexOf('s ');
  return { t: Math.round(parseFloat(l.slice(0, i)) * 1000), text: l.slice(i + 2) };
});

/** Each landed application of `spell` with the times of its own ticks (until the next application or the mob's death). */
function applications(evs: Ev[], spell: string): { at: number; rank: number; ticks: number[] }[] {
  const out: { at: number; rank: number; ticks: number[] }[] = [];
  for (const e of evs) {
    const land = e.text.match(new RegExp(`^${spell} r(\\d+) lands$`));
    if (land) out.push({ at: e.t, rank: Number(land[1]), ticks: [] });
    else if (e.text.startsWith(`tick ${spell} `) && out.length) out[out.length - 1]!.ticks.push(e.t);
    else if (e.text === 'mob dies') break;
  }
  return out;
}

/** Wrack channel windows [start, end] from the trace (end = its last tick). */
function wrackWindows(evs: Ev[]): [number, number][] {
  const out: [number, number][] = [];
  for (const e of evs) {
    if (e.text.startsWith('wrack r') && e.text.endsWith(' lands')) out.push([e.t, e.t]);
    else if (e.text.startsWith('tick wrack ') && out.length) out[out.length - 1]![1] = e.t;
  }
  return out;
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('Wrack damage matches Wowhead and the wiki', () => {
  const w = getSpell('wrack');
  const r = rankAt('wrack', 'max', 60)!;
  const base = (level: number): number => ((r.baseAt40 ?? 0) + (r.perLevel ?? 0) * (level - 40)) * (r.hotfixMult ?? 1);
  it('6 s channel, 1 s ticks, 200 mana, shadow', () => {
    expect(w.kind).toBe('channel');
    expect(w.channelMs).toBe(6000);
    expect(w.tickMs).toBe(1000);
    expect(r.mana).toBe(200);
    expect(w.school).toBe('shadow');
  });
  it('base 25 per tick at level 40 (Wowhead) and 60 at level 60 (wiki)', () => {
    expect(Math.round(base(40))).toBe(25);
    expect(Math.round(base(60))).toBe(60);
  });
  it('spell power coefficient after the -30% hotfix is 0.2002 per tick (Wowhead SP mod)', () => {
    expect((w.coeffTick ?? 0) * (r.hotfixMult ?? 1)).toBeCloseTo(0.2002, 4);
  });
  it('speeds up exactly Corruption, Bane of Agony and Siphon Life', () => {
    expect([...(w.accelerates ?? [])].sort()).toEqual(['bane_of_agony', 'corruption', 'siphon_life']);
  });
});

describe('Wrack speeds up DoT ticks without shortening them', () => {
  const runs = SEEDS.map((s) => parse(simulatePull(cfg('AFF_WRACK'), s).trace));

  it('no DoT tick lands after its application ends (duration unchanged)', () => {
    for (const evs of runs) {
      for (const spell of ['corruption', 'bane_of_agony', 'siphon_life']) {
        for (const a of applications(evs, spell)) {
          const sp = getSpell(spell);
          const dur = rankAt(spell, a.rank, 60)?.durationMs ?? sp.durationMs ?? 0;
          for (const tk of a.ticks) expect(tk, `${spell} applied at ${a.at}`).toBeLessThanOrEqual(a.at + dur);
        }
      }
    }
  });

  it('a DoT that runs to its end under a Wrack channel gets more ticks than its base count', () => {
    let gained = 0;
    for (const evs of runs) {
      const wins = wrackWindows(evs);
      for (const spell of ['corruption', 'bane_of_agony']) {
        const sp = getSpell(spell);
        for (const a of applications(evs, spell)) {
          const dur = rankAt(spell, a.rank, 60)?.durationMs ?? sp.durationMs ?? 0;
          const baseTicks = Math.round(dur / (sp.tickMs ?? 3000));
          const overlap = wins.reduce((s, [b, e]) => s + Math.max(0, Math.min(e, a.at + dur) - Math.max(b, a.at)), 0);
          expect(a.ticks.length, `${spell} at ${a.at}`).toBeLessThanOrEqual(baseTicks + Math.ceil(overlap / (sp.tickMs ?? 3000)) + 1);
          if (overlap >= 6000 && a.ticks.length > baseTicks) gained++;
        }
      }
    }
    expect(gained).toBeGreaterThan(0);
  });

  it('during a channel the DoT ticks at half its spacing', () => {
    let checked = 0;
    for (const evs of runs) {
      for (const [b, e] of wrackWindows(evs)) {
        const ticks = evs.filter((x) => x.text.startsWith('tick corruption ') && x.t > b && x.t <= e).map((x) => x.t);
        for (let i = 1; i < ticks.length; i++) {
          expect(ticks[i]! - ticks[i - 1]!).toBe(1500);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('skipped time is kept: the first tick after a channel comes sooner than a full spacing (Blizzard example)', () => {
    // After the channel stops, the tick that was in progress keeps the time Wrack skipped: it lands less than a full
    // 3 s after the previous Corruption tick whenever the channel ended between two ticks.
    let checked = 0;
    for (const evs of runs) {
      const corr = evs.filter((x) => x.text.startsWith('tick corruption ')).map((x) => x.t);
      const lands = evs.filter((x) => /^corruption r\d+ lands$/.test(x.text)).map((x) => x.t);
      const wins = wrackWindows(evs);
      for (const [b, e] of wins) {
        const before = corr.filter((x) => x <= e).pop();
        const after = corr.find((x) => x > e);
        if (before === undefined || after === undefined || before === e || before <= b) continue;
        if (lands.some((x) => x > before && x <= after)) continue;
        if (wins.some(([b2]) => b2 >= e && b2 < after)) continue; // a new channel sped the tick up again
        if (evs.some((x) => x.text === 'mob dies' && x.t <= e + 1000)) continue; // the channel may still be running
        const intoTickAtEnd = e - before; // dot-time already advanced = 2 x (e - before), capped by the spacing
        expect(after - e).toBeCloseTo(3000 - 2 * intoTickAtEnd, -1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('without Wrack a Corruption never gets more than its base tick count', () => {
    for (const s of SEEDS) {
      const evs = parse(simulatePull(cfg('DEMO_PACT_R1', 50, {}, { demo_use_agony: true }), s).trace);
      for (const a of applications(evs, 'corruption')) {
        const dur = rankAt('corruption', a.rank, 60)?.durationMs ?? 0;
        expect(a.ticks.length).toBeLessThanOrEqual(Math.round(dur / 3000));
      }
    }
  });

  it('total DoT damage per application rises with Wrack (more ticks per Corruption than without it)', () => {
    const perApp = (id: string): number => {
      let ticks = 0;
      let apps = 0;
      for (const s of SEEDS) {
        for (const a of applications(parse(simulatePull(cfg(id), s).trace), 'corruption')) {
          ticks += a.ticks.length;
          apps++;
        }
      }
      return ticks / apps;
    };
    expect(perApp('AFF_WRACK')).toBeGreaterThan(perApp('AFF_DRAINTANK'));
  });
});
