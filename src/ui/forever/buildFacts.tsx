import type { ReactNode } from 'react';
import type { BuildVariant } from '../../forever/builds';
import { getSpell } from '../../forever/spells';
import type { Tree } from '../../forever/types';
import { IconTile } from './IconTile';

export const TITLES: Record<BuildVariant['rotation'], string> = { affliction: 'Affliction (DoT-y + filler)', demonology: 'Demonology (Shadow Bolt + pet)', fire: 'Demonology/Fire (Immolate + Searing Pain)' };
export const PET_NAMES: Record<string, string> = { imp: 'Imp', voidwalker: 'Voidwalker', succubus: 'Succubus', felhunter: 'Felhunter' };
const FILLER_SPELLS: Record<string, string[]> = { wrack: ['wrack'], drain_life: ['drain_life'], shadow_bolt: ['shadow_bolt'], searing_pain: ['searing_pain'] };
export const FILLER_NAMES: Record<string, string> = { wrack: 'Wrack', drain_life: 'Drain Life (tank)', shadow_bolt: 'Shadow Bolt', searing_pain: 'Searing Pain' };

type Icon = { kind: 'spell' | 'talent'; id: string };

/** The icon that stands for each talent tree. */
export const TREE_ICONS: Record<Tree, Icon> = { aff: { kind: 'spell', id: 'corruption' }, demo: { kind: 'talent', id: 'demonic_embrace' }, destro: { kind: 'spell', id: 'immolate' } };
export const ROTATION_ICONS: Record<BuildVariant['rotation'], Icon> = { affliction: TREE_ICONS.aff, demonology: TREE_ICONS.demo, fire: TREE_ICONS.destro };

export function spellName(id: string): string {
  if (id === 'eureka') return 'Eureka!';
  if (id === 'life_tap') return 'Life Tap';
  try {
    return getSpell(id).name;
  } catch {
    return id;
  }
}

/** One row of an icon fact list (`dl.fv-facts.fv-facts-icons`): the label, then the icons with their text. */
export function FactRow({ label, icons, children }: { label: string; icons?: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {icons}
        <span>{children}</span>
      </dd>
    </>
  );
}

/** What a build fights with: pet, Shadow Bolt rank, filler and talent order. */
export function LoadoutRows({ v, petNote = '' }: { v: BuildVariant; petNote?: string }) {
  return (
    <>
      <FactRow label="Pet" icons={v.pet ? <IconTile kind="pet" id={v.pet} name={PET_NAMES[v.pet] ?? v.pet} size={28} /> : null}>
        {v.pet ? (PET_NAMES[v.pet] ?? v.pet) : 'brak'}
        {v.sacrificed ? `, poświęcony: ${PET_NAMES[v.sacrificed] ?? v.sacrificed}` : ''}
        {petNote}
      </FactRow>
      <FactRow label="Shadow Bolt" icons={<IconTile kind="spell" id="shadow_bolt" name="Shadow Bolt" size={28} />}>
        {v.rotation === 'fire' ? 'ranga 1' : v.rank === 'max' ? 'najwyższa ranga' : `ranga ${v.rank}`}
      </FactRow>
      <FactRow label="Filler" icons={FILLER_SPELLS[v.filler]?.map((sp) => <IconTile key={sp} kind="spell" id={sp} name={spellName(sp)} size={28} />)}>
        {FILLER_NAMES[v.filler] ?? v.filler}
      </FactRow>
      <FactRow label="Talenty">
        {v.order.startsWith('custom:') ? 'własna kolejność' : v.order}
        {v.pre_respec_build ? ` (do respeca na levelu ${v.respec_level}: ${v.pre_respec_build})` : ''}
      </FactRow>
    </>
  );
}
