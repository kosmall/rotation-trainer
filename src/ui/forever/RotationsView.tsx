import { loadVariant, VARIANT_IDS } from '../../forever/builds';

type Kind = 'affliction' | 'demonology' | 'fire';

export const ROTATION_STEPS: Readonly<Record<Kind, readonly string[]>> = {
  affliction: [
    'Shadow Bolt, gdy jest Shadow Trance (Nightfall), najwyższa ranga',
    'Curse of the Elements (jeśli włączona, brak klątwy na celu)',
    'Bane of Agony (jeśli cel żyje wystarczająco długo)',
    'Corruption',
    'Siphon Life',
    'Immolate (tylko gdy parametr aff_use_immolate włączony)',
    'Drain Soul na dobicie (Soul Harvest; gdy DoT-y i pet zabiją cel w oknie kanału)',
    'Filler zależny od buildu: Wrack, albo Drain Life (Wrack tylko przy 1 mobie)',
    'Drain Life, potem Shadow Bolt najwyższej rangi',
    'Gdy mało many: Shadow Bolt ranga 2, potem 1',
  ],
  demonology: [
    'Shadow Bolt, gdy jest Shadow Trance (ranga z buildu)',
    'Searing Pain, aby odświeżyć Demonic Brand (jeśli talent i pet żyje)',
    'Curse of the Elements, Bane of Agony (jeśli demo_use_agony), Corruption: tylko gdy cel żyje wystarczająco długo',
    'Drain Soul na dobicie (jeśli Soul Harvest)',
    'Shadow Bolt w randze z buildu (1, 2 albo najwyższa)',
    'Gdy mało many: Shadow Bolt ranga 2, potem 1',
  ],
  fire: [
    'Shadow Bolt ranga 1, gdy jest Shadow Trance',
    'Searing Pain, aby odświeżyć Demonic Brand (imp)',
    'Immolate, jeśli brak na celu i cel żyje wystarczająco długo',
    'Filler: Searing Pain najwyższej rangi (albo Shadow Bolt r1, wg parametru fire_filler)',
    'Shadow Bolt ranga 1',
  ],
};

const TITLES: Record<Kind, string> = { affliction: 'Affliction (DoT-y + filler)', demonology: 'Demonology (Shadow Bolt + pet)', fire: 'Demonology/Fire (Immolate + Searing Pain)' };

/** The rotations the simulator plays (priority lists mirroring src/forever/rotations.ts) and which build uses which. */
export function RotationsView() {
  return (
    <>
      <p className="fv-note">Pierwszy dostępny i stać nas na niego czar z listy jest rzucany; poza walką i przy niskim HP decyduje strategia Life Tapa (ustawienia zaawansowane).</p>
      {(Object.keys(ROTATION_STEPS) as Kind[]).map((k) => (
        <section key={k} className="fv-panel">
          <h2>{TITLES[k]}</h2>
          <p className="fv-note">
            Używają jej: {VARIANT_IDS.filter((id) => loadVariant(id).rotation === k).join(', ') || '-'}
          </p>
          <ol>
            {ROTATION_STEPS[k].map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}
