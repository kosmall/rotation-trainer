import { describe, expect, it } from 'vitest';
import { buildDestructionWarlock } from '../../src/data/classes/warlock/destruction';
import type { SpecData } from '../../src/data/types';
import { createRng } from '../../src/engine/rng';
import type { AuraView, ScheduledAura } from '../../src/engine/types';
import { applySetup } from '../../src/setup/applySetup';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG } from '../../src/setup/defaults';
import {
  barFraction,
  buffTimeText,
  buildBuffViews,
  isExpiring,
  nextTotals,
  timeLeftWords,
  type ActiveBuffView,
  type AuraTotals,
  type BuffViewInput,
} from '../../src/ui/buffsView';

// The Icon and the Band are the author's gear item effects since gear item effects Task 2: entry
// ids item:29370 / item:29305, aura ids item-buff:35163 / item-buff:35084, hidden ICD
// item-icd:29305 (stage F: ICON_AURA / BAND_AURA for both,
// 'band-of-the-eternal-sage-icd'); their icons are the items' (iconKind 'item').
const ICON = 'item:29370';
const BAND = 'item:29305';
const ICON_AURA = 'item-buff:35163';
const BAND_AURA = 'item-buff:35084';
const BAND_ICD_AURA_ID = 'item-icd:29305';

/** Raid buff, individual buff, flask, a target debuff and every self-aura source of the catalog. */
const ENABLED = [
  'arcane-brilliance',
  'blessing-of-kings',
  'flask-of-supreme-power',
  'misery',
  'heroism',
  'destruction-potion',
  'super-mana-potion',
  ICON,
  BAND,
];

const config = normalizeSetup(
  {
    ...structuredClone(DEFAULT_SETUP),
    enabledBuffs: ENABLED,
    timed: { ...DEFAULT_SETUP.timed, heroism: { startSec: 12, durationSec: 40 } },
  },
  SETUP_CATALOG,
);
const applied = applySetup({ buildSpec: buildDestructionWarlock, catalog: SETUP_CATALOG, config });
const spec: SpecData = applied.spec;

const catalogDescription = (id: string) => {
  const b = SETUP_CATALOG.find((x) => x.id === id);
  if (!b) throw new Error(`no buff ${id}`);
  return b.description;
};

const aura = (auraId: string, remainingMs: number, p: Partial<AuraView> = {}): AuraView => ({
  auraId,
  stacks: 1,
  charges: 0,
  remainingMs,
  ...p,
});

const auras = (...views: AuraView[]): Record<string, AuraView> => Object.fromEntries(views.map((v) => [v.auraId, v]));

function views(p: Partial<BuffViewInput>) {
  return buildBuffViews({
    selfAuras: {},
    spec,
    catalog: SETUP_CATALOG,
    scheduled: applied.sim.scheduledAuras,
    enabledBuffIds: config.enabledBuffs,
    nowMs: 0,
    phase: 'running',
    fightDurationMs: 60000,
    ...p,
  });
}

describe('buildBuffViews: active', () => {
  it('active entries carry name/icon/count/remaining clamped to the fight end', () => {
    const { active } = views({
      nowMs: 50000,
      selfAuras: auras(
        aura('heroism', 30000),
        aura(ICON_AURA, 8000),
        aura('destruction-potion', 12000, { stacks: 3 }),
        aura(BAND_AURA, 4000, { charges: 2 }),
      ),
    });
    expect(active).toEqual([
      {
        auraId: 'heroism',
        // The catalog entry's name (what the setup calls it), not the AuraDef's 'Heroism'.
        name: 'Heroism / Bloodlust',
        icon: 'ability_shaman_heroism',
        description: catalogDescription('heroism'),
        count: null,
        remainingMs: 10000, // 30 s left on the aura, 10 s left in the fight
      },
      {
        auraId: ICON_AURA,
        // The item's name (the AuraDef is 'Blessing of the Silver Crescent').
        name: 'Icon of the Silver Crescent',
        icon: 'inv_weapon_shortblade_23', // the item's icon (stage F: the buff's inv_trinket_naxxramas06)
        description: catalogDescription(ICON),
        count: null,
        remainingMs: 8000,
      },
      {
        auraId: 'destruction-potion',
        name: 'Destruction Potion',
        icon: 'inv_potion_107',
        description: catalogDescription('destruction-potion'),
        count: 3,
        remainingMs: 10000,
      },
      {
        // The Band's proc aura comes from the entry's helper `auras`.
        auraId: BAND_AURA,
        name: 'Band of the Eternal Sage',
        icon: 'inv_jewelry_ring_55', // the item's icon (stage F: the buff's spell_holy_mindvision)
        description: catalogDescription(BAND),
        count: 2,
        remainingMs: 4000,
      },
    ]);
  });

  it('keeps the order the tracker gives (first applied first)', () => {
    const order = (selfAuras: Record<string, AuraView>) => views({ selfAuras }).active.map((a) => a.auraId);
    expect(order(auras(aura(ICON_AURA, 1000), aura('heroism', 2000)))).toEqual([
      ICON_AURA,
      'heroism',
    ]);
    expect(order(auras(aura('heroism', 2000), aura(ICON_AURA, 1000)))).toEqual([
      'heroism',
      ICON_AURA,
    ]);
  });

  it('hidden auras are not in selfAuras (nothing to do) and unknown aura ids fall back to the id as name', () => {
    const withOwn: SpecData = {
      ...spec,
      auras: [...spec.auras, { id: 'own-aura', name: 'Own Aura', icon: 'spell_own', durationMs: 5000 }],
    };
    const { active } = views({
      spec: withOwn,
      selfAuras: auras(aura('own-aura', 3000), aura('mystery', 2000), aura(BAND_ICD_AURA_ID, 50000)),
    });
    expect(active).toEqual([
      // No catalog entry: the AuraDef's name and icon, the name as the description.
      { auraId: 'own-aura', name: 'Own Aura', icon: 'spell_own', description: 'Own Aura', count: null, remainingMs: 3000 },
      // Not even an AuraDef: the id, no icon (the tile shows initials).
      { auraId: 'mystery', name: 'mystery', icon: null, description: 'mystery', count: null, remainingMs: 2000 },
    ]);
    // The snapshot already leaves hidden auras out; a hidden one passed anyway is not shown.
    expect(active.some((a) => a.auraId === BAND_ICD_AURA_ID)).toBe(false);
  });

  it('fight length other than 60 s clamps correctly', () => {
    const { active, upcoming } = views({
      fightDurationMs: 30000,
      nowMs: 25000,
      selfAuras: auras(aura('heroism', 30000), aura('destruction-potion', 3000)),
      scheduled: [
        { auraId: ICON_AURA, on: 'self', atMs: 29999 },
        { auraId: 'heroism', on: 'self', atMs: 30000 },
        { auraId: 'destruction-potion', on: 'self', atMs: 45000 },
      ],
    });
    expect(active.map((a) => [a.auraId, a.remainingMs])).toEqual([
      ['heroism', 5000],
      ['destruction-potion', 3000],
    ]);
    // One ms before the end it is upcoming. At the fight's last ms the engine applies it as the
    // fight ends: no effect (the Setup panel's warning), so not upcoming; after the end never.
    expect(upcoming.map((u) => [u.auraId, u.inMs])).toEqual([[ICON_AURA, 4999]]);
    // Applied at the end: not shown in the ended fight either (it never was on during the fight).
    const atEnd = views({
      fightDurationMs: 30000,
      nowMs: 30000,
      phase: 'ended',
      selfAuras: auras(aura('heroism', 40000), aura('destruction-potion', 3000)),
      scheduled: [{ auraId: 'heroism', on: 'self', atMs: 30000, durationMs: 40000 }],
    });
    expect(atEnd.active.map((a) => a.auraId)).toEqual(['destruction-potion']);

    // After the end nothing is left in the fight.
    const ended = views({ fightDurationMs: 30000, nowMs: 30000, phase: 'ended', selfAuras: auras(aura('heroism', 7000)) });
    expect(ended.active.map((a) => a.remainingMs)).toEqual([0]);
    expect(ended.upcoming).toEqual([]);
  });
});

describe('buildBuffViews: upcoming', () => {
  const scheduled: ScheduledAura[] = [
    { auraId: 'heroism', on: 'self', atMs: 12000, durationMs: 40000 },
    { auraId: 'misery', on: 'target', atMs: 5000 },
    { auraId: 'destruction-potion', on: 'self', atMs: 8000 },
    { auraId: BAND_AURA, on: 'self', atMs: 70000 },
    { auraId: ICON_AURA, on: 'self', atMs: 3000 },
    { auraId: BAND_ICD_AURA_ID, on: 'self', atMs: 9000 },
    { auraId: 'heroism', on: 'self', atMs: Number.NaN },
    { auraId: 'heroism', on: 'self', atMs: 20000, durationMs: 0 },
  ];

  it('upcoming lists only self entries after now and within the fight, sorted by atMs; in ready inMs equals atMs; an entry at atMs equal to now is not upcoming (it has applied)', () => {
    const running = views({ scheduled, nowMs: 3000 });
    expect(running.upcoming).toEqual([
      {
        auraId: 'destruction-potion',
        name: 'Destruction Potion',
        icon: 'inv_potion_107',
        startsAtMs: 8000,
        inMs: 5000,
      },
      { auraId: 'heroism', name: 'Heroism / Bloodlust', icon: 'ability_shaman_heroism', startsAtMs: 12000, inMs: 9000 },
    ]);

    const ready = views({ scheduled, nowMs: 0, phase: 'ready' });
    expect(ready.upcoming.map((u) => [u.auraId, u.startsAtMs, u.inMs])).toEqual([
      [ICON_AURA, 3000, 3000],
      ['destruction-potion', 8000, 8000],
      ['heroism', 12000, 12000],
    ]);
  });

  it('in ready an entry at 0 (or before) is still upcoming: the fight applies it when it starts', () => {
    const atZero: ScheduledAura[] = [
      { auraId: 'heroism', on: 'self', atMs: 0, durationMs: 40000 },
      { auraId: 'destruction-potion', on: 'self', atMs: -500.7 },
    ];
    expect(views({ scheduled: atZero, phase: 'ready' }).upcoming.map((u) => [u.auraId, u.startsAtMs, u.inMs])).toEqual([
      ['heroism', 0, 0],
      ['destruction-potion', 0, 0],
    ]);
    // Once it runs they have applied at 0.
    expect(views({ scheduled: atZero, phase: 'running', nowMs: 0 }).upcoming).toEqual([]);
  });

  it('the setup scheduled Heroism at 12 s: upcoming until 12 s, then not', () => {
    expect(views({ nowMs: 11999 }).upcoming.map((u) => [u.auraId, u.inMs])).toEqual([['heroism', 1]]);
    expect(views({ nowMs: 12000 }).upcoming).toEqual([]);
    expect(views({ nowMs: 0, phase: 'ended' }).upcoming).toEqual([]);
  });
});

describe('buildBuffViews: permanent', () => {
  it('permanent lists stat-only enabled buffs and none of the timed/action/aura buffs', () => {
    const { permanent } = views({});
    expect(permanent).toEqual(
      ['arcane-brilliance', 'blessing-of-kings', 'flask-of-supreme-power'].map((id) => {
        const b = SETUP_CATALOG.find((x) => x.id === id);
        return { id, name: b?.name, icon: b?.icon, description: b?.description };
      }),
    );

    // The whole real catalog enabled: the raid/party/individual buffs and the consumables that
    // only change stats or modifiers, in catalog order.
    const all = views({ enabledBuffIds: SETUP_CATALOG.map((b) => b.id) }).permanent.map((p) => p.id);
    expect(all).toEqual([
      'arcane-brilliance',
      'gift-of-the-wild',
      'prayer-of-spirit',
      'moonkin-aura',
      'mana-spring-totem',
      'wrath-of-air-totem',
      'totem-of-wrath',
      'inspiring-presence',
      'blessing-of-kings',
      'blessing-of-wisdom',
      'flask-of-supreme-power',
      'flask-of-distilled-wisdom',
      'flask-of-pure-death',
      'elixir-of-major-shadow-power',
      'elixir-of-major-firepower',
      'adepts-elixir',
      'greater-arcane-elixir',
      'elixir-of-draenic-wisdom',
      'elixir-of-major-mageblood',
      'blackened-basilisk',
      'skullfish-soup',
      'blackened-sporefish',
      'brilliant-wizard-oil',
      'superior-wizard-oil',
    ]);
    for (const id of [
      'heroism', // timed self aura
      'destruction-potion', // item action + self aura
      'super-mana-potion', // item action
      'dark-rune', // item action
      ICON, // item action + self aura
      BAND, // proc aura (helper auras + hook)
      'misery', // target debuff
      'judgement-of-wisdom', // target debuff + hook
    ]) {
      expect(all).not.toContain(id);
    }
  });

  it('a disabled buff is not listed, an unknown enabled id is ignored', () => {
    expect(views({ enabledBuffIds: ['nope', 'blessing-of-kings'] }).permanent.map((p) => p.id)).toEqual(['blessing-of-kings']);
    expect(views({ enabledBuffIds: [] }).permanent).toEqual([]);
  });
});

describe('time texts', () => {
  it('buffTimeText: one decimal below 10 s, else remainingText', () => {
    expect(buffTimeText(22100)).toBe('23s');
    expect(buffTimeText(10000)).toBe('10s');
    expect(buffTimeText(9901)).toBe('10s'); // would read "10.0s"
    expect(buffTimeText(9900)).toBe('9.9s');
    expect(buffTimeText(4301)).toBe('4.4s'); // rounded up, as remainingText
    expect(buffTimeText(150000)).toBe('3m');
    expect(buffTimeText(0)).toBe('0.0s');
  });

  it('timeLeftWords: whole seconds (rounded up), minutes from 100 s on', () => {
    expect(timeLeftWords(22100)).toBe('23 seconds left');
    expect(timeLeftWords(1000)).toBe('1 second left');
    expect(timeLeftWords(400)).toBe('1 second left');
    expect(timeLeftWords(0)).toBe('0 seconds left');
    expect(timeLeftWords(150000)).toBe('3 minutes left');
  });

  it('isExpiring: below 5000 ms, not at 5000', () => {
    expect(isExpiring(4999)).toBe(true);
    expect(isExpiring(5000)).toBe(false);
    expect(isExpiring(1)).toBe(true);
  });
});

const active = (...entries: [string, number][]): ActiveBuffView[] =>
  entries.map(([auraId, remainingMs]) => ({ auraId, name: auraId, icon: null, description: auraId, count: null, remainingMs }));

const totalsOf = (t: AuraTotals) => Object.fromEntries([...t].map(([id, v]) => [id, v.totalMs]));

describe('nextTotals', () => {
  it('a new aura starts at its remaining time; the total is the max seen; a refresh (remaining rises) restarts; an aura that fades is dropped and returns as new', () => {
    let t: AuraTotals = new Map();
    t = nextTotals(t, active(['heroism', 40000]));
    expect(totalsOf(t)).toEqual({ heroism: 40000 });
    t = nextTotals(t, active(['heroism', 39000], ['potion', 15000]));
    expect(totalsOf(t)).toEqual({ heroism: 40000, potion: 15000 });
    // The same snapshot twice changes nothing.
    t = nextTotals(t, active(['heroism', 39000], ['potion', 15000]));
    expect(totalsOf(t)).toEqual({ heroism: 40000, potion: 15000 });
    t = nextTotals(t, active(['heroism', 10000], ['potion', 2000]));
    expect(totalsOf(t)).toEqual({ heroism: 40000, potion: 15000 });
    // Refreshed with a duration shorter than the old total: the bar restarts from the new time.
    t = nextTotals(t, active(['heroism', 9000], ['potion', 12000]));
    expect(totalsOf(t)).toEqual({ heroism: 40000, potion: 12000 });
    t = nextTotals(t, active(['potion', 11000]));
    expect(totalsOf(t)).toEqual({ potion: 12000 });
    // Heroism faded and comes back: a new application.
    t = nextTotals(t, active(['potion', 10000], ['heroism', 5000]));
    expect(totalsOf(t)).toEqual({ potion: 12000, heroism: 5000 });
  });

  it('bar fraction remaining / total is within [0, 1] for 10 000 random sequences', () => {
    const rng = createRng(20261030);
    const ids = ['a', 'b', 'c'];
    for (let seq = 0; seq < 10000; seq++) {
      let t: AuraTotals = new Map();
      const remaining = new Map<string, number>();
      for (let step = 0; step < 12; step++) {
        for (const id of ids) {
          const r = rng.next();
          const cur = remaining.get(id);
          if (cur === undefined) {
            if (r < 0.4) remaining.set(id, Math.floor(rng.next() * 60000));
          } else if (r < 0.15) remaining.delete(id); // fades
          else if (r < 0.3) remaining.set(id, Math.floor(rng.next() * 60000)); // refresh to any time
          else remaining.set(id, Math.max(0, cur - Math.floor(rng.next() * 5000))); // time passes
        }
        const list = active(...remaining);
        t = nextTotals(t, list);
        expect([...t.keys()].sort()).toEqual([...remaining.keys()].sort());
        for (const a of list) {
          const f = barFraction(a.remainingMs, t.get(a.auraId)?.totalMs);
          if (!(f >= 0 && f <= 1)) throw new Error(`fraction ${f} out of [0, 1] (seq ${seq}, step ${step})`);
        }
      }
    }
  });

  it('barFraction: no total yet means full, a zero total means empty, never outside [0, 1]', () => {
    expect(barFraction(20000, 40000)).toBe(0.5);
    expect(barFraction(20000, undefined)).toBe(1);
    expect(barFraction(0, 0)).toBe(0);
    expect(barFraction(50000, 40000)).toBe(1);
    expect(barFraction(-1, 40000)).toBe(0);
  });
});
