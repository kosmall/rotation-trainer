import type { ReactNode } from 'react';
import type { BuildVariant } from '../../forever/builds';
import { FILLER_NAME, rotationLabel, type FillerGene } from '../../forever/rotation-genes';
import { getSpell } from '../../forever/spells';
import type { Params, Tree } from '../../forever/types';
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

/** The rotation of a build in words: the template title, or the composed rotation. */
export function rotationTitle(v: BuildVariant): string {
  return v.genes ? `Własna rotacja: ${rotationLabel(v.genes)}` : TITLES[v.rotation];
}

/** The health floor (fraction) above which a Wrack-filler build channels Wrack (Drain Life below it); 0 = always Wrack. */
export function wrackFloor(v: BuildVariant, params?: Params): number {
  return v.filler === 'wrack' ? (v.wrack_min_hp_pct ?? params?.wrack_min_hp_pct ?? 0) : 0;
}

/** The pet rules of a build in words: "Succubus na levelach 20-29 przy 1 mobie". */
export function petRulesText(v: BuildVariant): string {
  return (v.pet_rules ?? [])
    .map((r) => {
      const levels = r.fromLevel !== undefined && r.toLevel !== undefined ? ` na levelach ${r.fromLevel}-${r.toLevel}` : r.toLevel !== undefined ? ` do levelu ${r.toLevel}` : r.fromLevel !== undefined ? ` od levelu ${r.fromLevel}` : '';
      const mobs = r.maxMobs === 1 ? ' przy 1 mobie' : r.minMobs !== undefined && r.maxMobs === r.minMobs ? ` przy ${r.minMobs} mobach` : r.minMobs !== undefined ? ` przy ${r.minMobs}+ mobach` : '';
      return `${PET_NAMES[r.pet] ?? r.pet}${levels}${mobs}`;
    })
    .join(', ');
}

const GENE_FILLER_SPELL: Record<FillerGene, string> = {
  sb_r1: 'shadow_bolt',
  sb_r2: 'shadow_bolt',
  sb_max: 'shadow_bolt',
  searing_pain: 'searing_pain',
  drain_life: 'drain_life',
  wrack: 'wrack',
  wrack_hp50: 'wrack',
  wrack_hp70: 'wrack',
  wrack_single_then_drain_life: 'wrack',
};

const pctText = (f: number): string => `${String(Math.round(f * 1000) / 10).replace('.', ',')}%`;

/** What a build fights with: pet, Shadow Bolt rank, filler and talent order. */
export function LoadoutRows({ v, petNote = '', params }: { v: BuildVariant; petNote?: string; params?: Params }) {
  const floor = wrackFloor(v, params);
  const fillerSpells = floor > 0 ? ['wrack', 'drain_life'] : FILLER_SPELLS[v.filler];
  return (
    <>
      <FactRow label="Pet" icons={v.pet ? <IconTile kind="pet" id={v.pet} name={PET_NAMES[v.pet] ?? v.pet} size={28} /> : null}>
        {v.pet ? (PET_NAMES[v.pet] ?? v.pet) : 'brak'}
        {v.sacrificed ? `, poświęcony: ${PET_NAMES[v.sacrificed] ?? v.sacrificed}` : ''}
        {v.pet_rules ? `; zamiast niego: ${petRulesText(v)}` : ''}
        {petNote}
      </FactRow>
      {v.genes ? (
        <FactRow label="Filler" icons={<IconTile kind="spell" id={GENE_FILLER_SPELL[v.genes.filler]} name={spellName(GENE_FILLER_SPELL[v.genes.filler])} size={28} />}>
          {FILLER_NAME[v.genes.filler]}
        </FactRow>
      ) : (
        <>
          <FactRow label="Shadow Bolt" icons={<IconTile kind="spell" id="shadow_bolt" name="Shadow Bolt" size={28} />}>
            {v.rotation === 'fire' ? 'ranga 1' : v.rank === 'max' ? 'najwyższa ranga' : `ranga ${v.rank}`}
          </FactRow>
          <FactRow label="Filler" icons={fillerSpells?.map((sp) => <IconTile key={sp} kind="spell" id={sp} name={spellName(sp)} size={28} />)}>
            {floor > 0 ? `Wrack, gdy HP powyżej ${pctText(floor)}; przy niższym HP Drain Life` : (FILLER_NAMES[v.filler] ?? v.filler)}
          </FactRow>
        </>
      )}
      <FactRow label="Talenty">
        {v.order.startsWith('custom:') ? 'własna kolejność' : v.order}
        {v.pre_respec_build ? ` (do respeca na levelu ${v.respec_level}: ${v.pre_respec_build})` : ''}
      </FactRow>
    </>
  );
}
