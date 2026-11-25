import { loadVariant, VARIANT_IDS } from '../../forever/builds';
import { getSpell } from '../../forever/spells';
import { IconTile } from './IconTile';

type Kind = 'affliction' | 'demonology' | 'fire';
export interface Step {
  /** Spell ids shown as icons (the spell(s) this step casts). */
  spells: readonly string[];
  text: string;
}

export const ROTATION_STEPS: Readonly<Record<Kind, readonly Step[]>> = {
  affliction: [
    { spells: ['shadow_bolt'], text: 'Shadow Bolt, gdy jest Shadow Trance (Nightfall), najwyższa ranga' },
    { spells: ['curse_of_elements'], text: 'Curse of the Elements (jeśli włączona, brak klątwy na celu)' },
    { spells: ['bane_of_agony'], text: 'Bane of Agony (jeśli cel żyje wystarczająco długo)' },
    { spells: ['corruption'], text: 'Corruption' },
    { spells: ['siphon_life'], text: 'Siphon Life' },
    { spells: ['immolate'], text: 'Immolate (tylko gdy parametr aff_use_immolate włączony)' },
    { spells: ['drain_soul'], text: 'Drain Soul na dobicie (Soul Harvest; gdy DoT-y i pet zabiją cel w oknie kanału)' },
    { spells: ['wrack', 'drain_life'], text: 'Filler zależny od buildu: Wrack, albo Drain Life (Wrack tylko przy 1 mobie)' },
    { spells: ['drain_life', 'shadow_bolt'], text: 'Drain Life, potem Shadow Bolt najwyższej rangi' },
    { spells: ['shadow_bolt'], text: 'Gdy mało many: Shadow Bolt ranga 2, potem 1' },
  ],
  demonology: [
    { spells: ['shadow_bolt'], text: 'Shadow Bolt, gdy jest Shadow Trance (ranga z buildu)' },
    { spells: ['searing_pain'], text: 'Searing Pain, aby odświeżyć Demonic Brand (jeśli talent i pet żyje)' },
    { spells: ['curse_of_elements', 'bane_of_agony', 'corruption'], text: 'Curse of the Elements, Bane of Agony (jeśli demo_use_agony), Corruption: tylko gdy cel żyje wystarczająco długo' },
    { spells: ['drain_soul'], text: 'Drain Soul na dobicie (jeśli Soul Harvest)' },
    { spells: ['shadow_bolt'], text: 'Shadow Bolt w randze z buildu (1, 2 albo najwyższa)' },
    { spells: ['shadow_bolt'], text: 'Gdy mało many: Shadow Bolt ranga 2, potem 1' },
  ],
  fire: [
    { spells: ['shadow_bolt'], text: 'Shadow Bolt ranga 1, gdy jest Shadow Trance' },
    { spells: ['searing_pain'], text: 'Searing Pain, aby odświeżyć Demonic Brand (imp)' },
    { spells: ['immolate'], text: 'Immolate, jeśli brak na celu i cel żyje wystarczająco długo' },
    { spells: ['searing_pain', 'shadow_bolt'], text: 'Filler: Searing Pain najwyższej rangi (albo Shadow Bolt r1, wg parametru fire_filler)' },
    { spells: ['shadow_bolt'], text: 'Shadow Bolt ranga 1' },
  ],
};

const TITLES: Record<Kind, string> = { affliction: 'Affliction (DoT-y + filler)', demonology: 'Demonology (Shadow Bolt + pet)', fire: 'Demonology/Fire (Immolate + Searing Pain)' };

function spellName(id: string): string {
  try {
    return getSpell(id).name;
  } catch {
    return id;
  }
}

/** The rotations the simulator plays (priority lists mirroring src/forever/rotations.ts) and which build uses which. */
export function RotationsView() {
  return (
    <>
      <p className="fv-note">Pierwszy dostępny i stać nas na niego czar z listy jest rzucany; poza walką i przy niskim HP decyduje strategia Life Tapa (ustawienia zaawansowane).</p>
      {(Object.keys(ROTATION_STEPS) as Kind[]).map((k) => (
        <section key={k} className="fv-panel">
          <h2>{TITLES[k]}</h2>
          <p className="fv-note">Używają jej: {VARIANT_IDS.filter((id) => loadVariant(id).rotation === k).join(', ') || '-'}</p>
          <ol className="fv-steps">
            {ROTATION_STEPS[k].map((s) => (
              <li key={s.text}>
                <span className="fv-step-icons">
                  {s.spells.map((id) => (
                    <span key={id} title={spellName(id)}>
                      <IconTile kind="spell" id={id} name={spellName(id)} size={32} />
                    </span>
                  ))}
                </span>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}
