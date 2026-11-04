// The Setup screen's rail (UI redesign spec §5.1): the sections in groups (Character, Fight,
// Library, Interface), each a link with its icon, name and a one-line value derived from the
// trainer's state (`railValue`). Keybinds is listed, disabled, until stage 2c.

import { memo } from 'react';
import { itemRowOf } from '../../setup/gearEffects';
import { gearNeedsDb } from '../../setup/gear';
import { ranksOf, treePoints } from '../talentView';
import { routeHref, SETUP_SECTION_TITLES } from '../shell/router';
import type { SetupSection } from '../shell/router';
import { ShellIcon } from '../shell/icons';
import { SpellIcon } from '../SpellIcon';
import { enabledCount } from '../SetupPanel';
import { useTrainer } from '../state/TrainerProvider';
import type { TrainerMeta, TrainerState } from '../state/TrainerProvider';
import { classOptionsOf } from './sections/classOptions';

/** What a rail resolver reads: the trainer's state and meta (`useTrainer`). */
export interface RailContext {
  state: TrainerState;
  meta: TrainerMeta;
}

/** A rail icon: a game icon file, or one of the UI glyphs. */
export type RailIcon = { kind: 'spell' | 'item' | 'talent'; name: string } | { kind: 'glyph'; glyph: 'text' | 'keys' };

export type RailGroup = 'Character' | 'Fight' | 'Library' | 'Interface';

export interface RailSection {
  id: SetupSection;
  group: RailGroup;
  label(ctx: RailContext): string;
  icon(ctx: RailContext): RailIcon;
  value(ctx: RailContext): string;
}

/** The first spell of the spec's action bar (the rotation's icon; class-agnostic). */
function firstSpellIcon({ state }: RailContext): RailIcon {
  const spec = state.nextFight.spec;
  const spell = spec.spells.find((s) => s.id === spec.keybinds[0]);
  return { kind: 'spell', name: spell?.icon ?? '' };
}

/** "Heroism / Bloodlust" -> "Heroism". */
const shortName = (name: string) => name.split(' / ')[0] ?? name;

/** The Setup sections in rail order, with their resolvers. */
export const SETUP_SECTIONS: readonly RailSection[] = [
  {
    id: 'gear',
    group: 'Character',
    label: () => SETUP_SECTION_TITLES.gear,
    icon: () => ({ kind: 'item', name: 'inv_helmet_103' }),
    value: ({ state, meta }) => {
      const needsDb = state.config.gear !== undefined && gearNeedsDb(state.config.gear) && state.itemDb.db === null;
      if (needsDb && state.itemDb.status === 'error') return 'Database failed: reload';
      if (needsDb || state.itemDb.status === 'loading') return 'Loading the item database…';
      return meta.labels.gear;
    },
  },
  {
    id: 'talents',
    group: 'Character',
    label: () => SETUP_SECTION_TITLES.talents,
    icon: () => ({ kind: 'talent', name: 'spell_fire_soulburn' }),
    value: ({ state, meta }) => `${meta.labels.talents}, ${treePoints(ranksOf(state.talents)).join(' / ')}`,
  },
  {
    id: 'buffs',
    group: 'Fight',
    label: () => SETUP_SECTION_TITLES.buffs,
    icon: () => ({ kind: 'spell', name: 'spell_magic_greaterblessingofkings' }),
    value: ({ state }) => {
      const { catalog } = state.nextFight;
      const debuffs = enabledCount(catalog, state.config, 'debuffs');
      const on = enabledCount(catalog, state.config, 'raid') + enabledCount(catalog, state.config, 'consumables') + debuffs;
      if (on === 0) return 'None on';
      return `${on} on, ${debuffs} target ${debuffs === 1 ? 'debuff' : 'debuffs'}`;
    },
  },
  {
    id: 'items',
    group: 'Fight',
    label: () => SETUP_SECTION_TITLES.items,
    icon: () => ({ kind: 'spell', name: 'inv_potion_107' }),
    value: ({ state }) => {
      const bound = itemRowOf(state.nextFight.catalog, new Set(state.config.enabledBuffs)).bound.length;
      return bound === 0 ? 'Item bar empty' : `${bound} on the item bar`;
    },
  },
  {
    id: 'rotation',
    group: 'Fight',
    label: () => SETUP_SECTION_TITLES.rotation,
    icon: firstSpellIcon,
    value: ({ state, meta }) => ((state.config.script?.rules.length ?? 0) > 0 ? meta.labels.rotation : `Basic, ${meta.labels.rotation}`),
  },
  {
    id: 'fight',
    group: 'Fight',
    label: () => SETUP_SECTION_TITLES.fight,
    icon: () => ({ kind: 'spell', name: 'ability_shaman_heroism' }),
    value: ({ state }) => {
      const { config } = state;
      const timed = state.nextFight.catalog.find((b) => b.timed && config.enabledBuffs.includes(b.id));
      if (timed) {
        const start = config.timed[timed.id]?.startSec ?? timed.timed?.defaultStartSec ?? 0;
        return `${config.fightDurationSec} s, ${shortName(timed.name)} at ${start} s`;
      }
      return `${config.fightDurationSec} s, ${config.distanceYd} yd`;
    },
  },
  {
    id: 'class',
    group: 'Fight',
    label: ({ meta }) => `${meta.spec.className} options`,
    icon: ({ state, meta }) => {
      const options = classOptionsOf(meta.spec.classId);
      return options ? { kind: 'spell', name: options.icon(state.config) } : { kind: 'glyph', glyph: 'keys' };
    },
    value: ({ state, meta }) => classOptionsOf(meta.spec.classId)?.value(state.config) ?? 'None for this class',
  },
  {
    id: 'scenarios',
    group: 'Library',
    label: () => SETUP_SECTION_TITLES.scenarios,
    icon: () => ({ kind: 'item', name: 'inv_weapon_shortblade_23' }),
    value: () => 'Coming with the script editor',
  },
  {
    id: 'combat-text',
    group: 'Interface',
    label: () => SETUP_SECTION_TITLES['combat-text'],
    icon: () => ({ kind: 'glyph', glyph: 'text' }),
    value: ({ state }) => (state.hudSettings.enabled ? `On, ${state.hudSettings.animation}` : 'Off'),
  },
];

const GROUPS: readonly RailGroup[] = ['Character', 'Fight', 'Library', 'Interface'];

/** The value line of a section in the rail ("My gear (export)", "14 on, 3 target debuffs"). */
export function railValue(section: SetupSection, ctx: RailContext): string {
  return SETUP_SECTIONS.find((s) => s.id === section)!.value(ctx);
}

/** The section's name as the rail and the section heading show it ("Warlock options" for the class). */
export function railLabel(section: SetupSection, ctx: RailContext): string {
  return SETUP_SECTIONS.find((s) => s.id === section)!.label(ctx);
}

function RailIconView({ icon }: { icon: RailIcon }) {
  if (icon.kind === 'glyph') {
    return (
      <span className="glyph" aria-hidden="true">
        <ShellIcon name={icon.glyph} />
      </span>
    );
  }
  return (
    <span className="rail-icon" aria-hidden="true">
      {icon.name !== '' && <SpellIcon kind={icon.kind} icon={icon.name} className="rail-icon-image" />}
    </span>
  );
}

/**
 * `nav[aria-label="Setup sections"]`: a link per section (`aria-current="page"` on the active one)
 * with its icon, name and value; Keybinds disabled. Memoized: re-renders on setup edits only.
 */
export const SetupRail = memo(function SetupRail({ active }: { active: SetupSection }) {
  const { state, meta } = useTrainer();
  const ctx: RailContext = { state, meta };
  return (
    <div className="rail">
      <nav aria-label="Setup sections">
        <div className="groups">
          {GROUPS.map((group) => (
            <div key={group}>
              <h2>{group}</h2>
              <ul>
                {SETUP_SECTIONS.filter((s) => s.group === group).map((s) => {
                  const value = s.value(ctx);
                  return (
                    <li key={s.id}>
                      <a href={routeHref({ mode: 'setup', section: s.id })} aria-current={s.id === active ? 'page' : undefined}>
                        <RailIconView icon={s.icon(ctx)} />
                        <span className="label">{s.label(ctx)}</span>
                        <span className="value" title={value}>
                          {value}
                        </span>
                      </a>
                    </li>
                  );
                })}
                {group === 'Interface' && (
                  <li>
                    <a role="link" aria-disabled="true">
                      <RailIconView icon={{ kind: 'glyph', glyph: 'keys' }} />
                      <span className="label">Keybinds</span>
                      <span className="value">Coming with stage 2c</span>
                    </a>
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
});
