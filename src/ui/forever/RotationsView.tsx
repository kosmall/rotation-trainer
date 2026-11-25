import { useState } from 'react';
import { loadVariant, VARIANT_IDS, type BuildVariant } from '../../forever/builds';
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

/** The steps of a build's rotation: the generic priority list with the build's own filler and Shadow Bolt rank filled in. */
export function stepsFor(v: BuildVariant): readonly Step[] {
  const rank = v.rank === 'max' ? 'najwyższa ranga' : `ranga ${v.rank}`;
  return ROTATION_STEPS[v.rotation].map((st) => {
    if (v.rotation === 'affliction' && st.text.startsWith('Filler'))
      return v.filler === 'wrack'
        ? { spells: ['wrack'], text: 'Filler: Wrack' }
        : { spells: ['wrack', 'drain_life'], text: 'Filler: Wrack tylko przy 1 mobie, w pozostałych przypadkach Drain Life (tank)' };
    if (v.rotation === 'demonology' && st.text.startsWith('Shadow Bolt w randze')) return { spells: st.spells, text: `Shadow Bolt, ${rank}` };
    if (v.rotation === 'demonology' && st.text.startsWith('Shadow Bolt, gdy jest')) return { spells: st.spells, text: `Shadow Bolt, gdy jest Shadow Trance (${rank})` };
    return st;
  });
}

/** One build's rotation (chosen from a dropdown): priority list with spell icons. */
export function RotationsView() {
  const [id, setId] = useState(VARIANT_IDS[0] as string);
  const v = loadVariant(id);
  return (
    <>
      <div className="fv-row">
        <label>
          Build{' '}
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {VARIANT_IDS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
      </div>
      <section className="fv-panel">
        <h2>{TITLES[v.rotation]}</h2>
        <p className="fv-note">
          Pet: {v.pet ?? 'brak'}; ranga Shadow Bolta: {String(v.rank)}; filler: {v.filler}. Pierwszy dostępny i na który stać nas czar z listy jest rzucany; poza walką i przy niskim HP decyduje strategia Life Tapa (ustawienia zaawansowane).
        </p>
        <ol className="fv-steps">
          {stepsFor(v).map((s) => (
            <li key={s.text}>
              <span className="fv-step-icons">
                {s.spells.map((sp) => (
                  <span key={sp} title={spellName(sp)}>
                    <IconTile kind="spell" id={sp} name={spellName(sp)} size={32} />
                  </span>
                ))}
              </span>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
