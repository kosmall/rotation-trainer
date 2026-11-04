// Everything the Report shows about one ended fight, computed once per fight (UI redesign Task 4):
// the view-models of reportView.ts applied to the fight's log, the bot's replay of it (botRun.ts),
// and the names of the fight's own spec and catalog. Pure; memoized by the caller per fight.

import type { LogEvent, School } from '../../engine/types';
import type { LaneRow } from '../charts/Lanes';
import { soFar } from '../fight/fightViewModel';
import type { SoFarRow } from '../fight/fightViewModel';
import { formatDps, formatInt, secondsText } from '../format';
import type { LastFight } from '../state/TrainerProvider';
import { botRun } from './botRun';
import type { BotRun } from './botRun';
import {
  auraUptimes,
  buffWindows,
  castWindows,
  cumulativeDps,
  dpsSeries,
  insights,
  logRows,
  makeNamer,
  rotationRows,
  spellTable,
  spellTotals,
  targetAuraIds,
} from './reportViewModel';
import type { AuraUptime, Insight, LogRow, Namer, RotationRow, SpellRow, SpellTotals } from './reportViewModel';

export interface ReportModel {
  last: LastFight;
  /** The bot's replay (same setup and seed), or null when it could not be replayed. */
  bot: BotRun | null;
  name: Namer;
  durationMs: number;
  spells: SpellRow[];
  totals: SpellTotals;
  /** The player's own visible auras (buffs, item effects), by first application. */
  buffs: AuraUptime[];
  /** "Active time (GCD)" and the DoT uptimes (the Fight dock's "So far" at the end). */
  kpis: SoFarRow[];
  series: { x: number[]; rolling: number[]; cumulative: number[]; bot: number[] | null };
  /** Buff windows above the DPS chart (buffs that were not up for the whole fight). */
  buffLanes: LaneRow[];
  /** The Timeline: spell lanes (DoTs as their uptime), then the buff lanes. */
  timeline: LaneRow[];
  insights: Insight[];
  rotation: RotationRow[];
  log: LogRow[];
}

const toneOf = (school: School | null): LaneRow['tone'] => (school === 'shadow' ? 'shadow' : school === 'fire' ? 'fire' : 'other');

/** "Heroism / Bloodlust" -> "Heroism"; "Destruction Potion" -> "Destruction Potion" cut to 16. */
function shortName(name: string): string {
  const first = name.split(' / ')[0]!;
  return first.length > 16 ? `${first.slice(0, 15)}…` : first;
}

const uptimeMap = (log: readonly LogEvent[], durationMs: number, ids: readonly string[]): Record<string, number> => {
  const all = new Map(auraUptimes(log, durationMs).map((u) => [u.auraId, u.uptime]));
  return Object.fromEntries(ids.map((id) => [id, all.get(id) ?? 0]));
};

/** The Report's model of an ended fight (runs the bot once: memoized by botRun). */
export function reportModel(last: LastFight): ReportModel {
  const { fight, log, snapshot } = last;
  const spec = fight.spec;
  const durationMs = snapshot.durationMs;
  const name = makeNamer(spec, fight.catalog);
  const items = new Set(spec.spells.filter((s) => s.item).map((s) => s.id));
  const hidden = new Set(spec.auras.filter((a) => a.hidden).map((a) => a.id));
  const targets = targetAuraIds(spec, fight.sim.scheduledAuras);
  const bot = botRun(last);

  const spells = spellTable(log, durationMs, items);
  const totals = spellTotals(spells, durationMs);
  const ups = auraUptimes(log, durationMs).filter((u) => !hidden.has(u.auraId));
  const buffs = ups.filter((u) => !targets.has(u.auraId));

  const rolling = dpsSeries(log, durationMs);
  const cumulative = cumulativeDps(log, durationMs);
  const series = {
    x: rolling.map((p) => p.t),
    rolling: rolling.map((p) => p.dps),
    cumulative: cumulative.map((p) => p.dps),
    bot: bot === null ? null : dpsSeries(bot.log, durationMs).map((p) => p.dps),
  };

  const windows = buffWindows(log, durationMs);
  const partial = (id: string) => {
    const w = windows.get(id) ?? [];
    return !(w.length === 1 && w[0]![0] <= 0 && w[0]![1] >= durationMs);
  };
  const buffLanes: LaneRow[] = buffs
    .filter((b) => partial(b.auraId))
    .map((b) => {
      const n = name(b.auraId);
      return { id: b.auraId, label: n.name, short: shortName(n.name), icon: n.icon, iconKind: n.iconKind, tone: 'buff', windows: windows.get(b.auraId) ?? [] };
    });

  // DoT spells show their aura's uptime; other spells their casts.
  const dotOf = new Map<string, string>();
  for (const s of spec.spells) {
    const aura = s.applyAura?.on === 'target' ? spec.auras.find((a) => a.id === s.applyAura!.auraId) : undefined;
    if (aura?.tick) dotOf.set(s.id, aura.id);
  }
  const timeline: LaneRow[] = [];
  for (const [spellId, w] of castWindows(log)) {
    if (items.has(spellId)) continue;
    const n = name(spellId);
    const dot = dotOf.get(spellId);
    timeline.push({
      id: spellId,
      label: n.name,
      icon: n.icon,
      iconKind: n.iconKind,
      tone: toneOf(n.school),
      windows: dot !== undefined ? (windows.get(dot) ?? w) : w,
    });
  }
  timeline.push(...buffLanes);

  const dotIds = [...new Set(dotOf.values())];
  const casts = (counts: Readonly<Record<string, number>>) => ({ ...counts });
  const you = { dps: snapshot.dps, uptimes: uptimeMap(log, durationMs, dotIds), casts: casts(snapshot.castCounts) };
  const botFacts = bot === null ? null : { dps: bot.dps, uptimes: uptimeMap(bot.log, durationMs, dotIds), casts: casts(bot.snapshot.castCounts) };

  return {
    last,
    bot,
    name,
    durationMs,
    spells,
    totals,
    buffs,
    kpis: soFar(snapshot, log, spec),
    series,
    buffLanes,
    timeline,
    insights: insights(you, botFacts, (id) => name(id).name),
    rotation: rotationRows(spec.priority, snapshot, bot?.snapshot ?? null),
    log: logRows(log, (id) => name(id).name),
  };
}

/** The share of the bot's DPS, e.g. "91.7%", or null without the bot. */
export function botShareText(model: Pick<ReportModel, 'bot' | 'last'>): string | null {
  const bot = model.bot;
  if (bot === null || !(bot.dps > 0)) return null;
  return `${((model.last.snapshot.dps / bot.dps) * 100).toFixed(1)}%`;
}

const pct = (x: number | null) => (x === null ? '–' : `${(x * 100).toFixed(1)}%`);

/** The report as plain text ("Copy Report"). */
export function reportText(model: ReportModel): string {
  const { last, bot, totals, durationMs } = model;
  const share = botShareText(model);
  const l = last.labels;
  return [
    'Rotation Trainer: fight report',
    `DPS ${formatDps(last.snapshot.dps)}${share !== null && bot !== null ? ` (${share} of the bot, ${formatDps(bot.dps)}, same setup and seed)` : ''}`,
    `Damage ${formatInt(totals.damage)}; duration ${secondsText(durationMs)} s; ${model.kpis.map((k) => `${k.label} ${pct(k.value)}`).join('; ')}`,
    `Played with: Setup ${l.setupPreset}; Gear ${l.gear}; Talents ${l.talents}; Rotation ${l.rotation}; Fight ${l.fight}`,
    'Per spell (damage, DPS, casts, crit, miss):',
    ...model.spells.map(
      (s) => `  ${model.name(s.spellId).name}: ${formatInt(s.damage)}, ${formatDps(s.dps)}, ${s.casts}, ${pct(s.critPct)}, ${s.misses}`,
    ),
    ...(model.insights.length > 0 ? ['What to look at:', ...model.insights.map((i) => `  ${i.text}`)] : []),
  ].join('\n');
}
