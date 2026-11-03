// Ready-made talent builds (stage 2b Task 3, design spec §4): the wowsims tbc-new Warlock DPS talent
// presets and the author's own build. Pure data; tests/data/talent-presets.test.ts validates every
// string (0 errors, at most 61 points). See docs/data-sources.md, "Part I: talents", Task 3.

import { decodeTalents, encodeTalents } from './talentTree';
import { destructionTalentString } from './talents';

export interface TalentPreset {
  /** Stable id (`[a-z0-9-]`). */
  id: string;
  /** The name wowsims gives the build (the author's: "My build (export)"). */
  name: string;
  /** The tree with the most points. */
  spec: 'affliction' | 'demonology' | 'destruction';
  /** Which phases the build is for, and why it is the same for all of them. */
  phaseNote: string;
  /** The build as a full-width talent string (21/22/21 digits, `encodeTalents`). */
  talents: string;
  /** The wowsims `talentsString` as written there (absent for the author's export). */
  wowsimsString?: string;
  source: string;
  /**
   * A Fire variant (not offered: the trainer plays the shadow rotation). wowsims has no separate
   * Fire talent string: its "Destruction (Fire)" build reuses `TalentsDestruction`.
   */
  fire?: boolean;
}

const WOWSIMS_SOURCE = 'wowsims/tbc-new @ 91f869a ui/specs/warlock/dps/presets.ts';
/** wowsims keeps one talent build per spec for every phase (its builds are all "P1" settings). */
const ALL_PHASES = 'wowsims has one build for every phase (no per-phase talent builds), so it is offered for all phases.';

/** A wowsims preset: the string as written there and its full-width form. */
function wowsims(id: string, name: string, spec: TalentPreset['spec'], wowsimsString: string, constant: string): TalentPreset {
  return {
    id,
    name,
    spec,
    phaseNote: ALL_PHASES,
    talents: encodeTalents(decodeTalents(wowsimsString).ranks),
    wowsimsString,
    source: `${WOWSIMS_SOURCE} \`${constant}\` (MIT licence)`,
  };
}

/**
 * The talent presets, the author's build first, then the wowsims ones in the order of
 * ui/specs/warlock/dps/spec.ts `presets.talents` grouped by spec (Destruction, Affliction,
 * Demonology). Frozen.
 */
export const TALENT_PRESETS: readonly Readonly<TalentPreset>[] = Object.freeze(
  [
    {
      id: 'my-build',
      name: 'My build (export)',
      spec: 'destruction',
      phaseNote: "The author's character as exported (the trainer's default build), the same for every phase.",
      talents: destructionTalentString,
      source: "The author's WowSimsExporter export (docs/samples/wowsimsexporter-destruction-warlock.json, `talents`)",
    } satisfies TalentPreset,
    wowsims('destruction', 'Destruction', 'destruction', '-20500301332101-50500051220051053105', 'TalentsDestruction'),
    wowsims('destro-nightfall', 'Destro/Nightfall', 'destruction', '150222201023--505020510200510531051', 'TalentsDestroNightfall'),
    wowsims('affliction', 'Affliction', 'affliction', '05022221112351055003--50500051220001', 'TalentsAffliction'),
    wowsims('demo-ruin', 'Demo/Ruin', 'demonology', '01-205003213305010150134-50500251020001', 'TalentsDemoRuin'),
    wowsims('demo-felguard', 'Demonology Felguard', 'demonology', '01-2050030133250101501351-5050005112', 'TalentsDemoFelguard'),
  ].map((p) => Object.freeze(p)),
);

/** The presets the talent editor offers (every one but Fire variants; there are none today). A new array. */
export function offeredTalentPresets(): Readonly<TalentPreset>[] {
  return TALENT_PRESETS.filter((p) => !p.fire);
}

/** The preset with this id (prototype-safe), or undefined. */
export function talentPresetById(id: unknown): Readonly<TalentPreset> | undefined {
  return typeof id === 'string' ? TALENT_PRESETS.find((p) => p.id === id) : undefined;
}
