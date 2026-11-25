import { useState } from 'react';
import { loadVariant, VARIANT_IDS, type BuildVariant } from '../../forever/builds';
import { getSpell } from '../../forever/spells';
import { IconTile } from './IconTile';
import { ScenarioNote } from './BuildsView';

type Kind = 'affliction' | 'demonology' | 'fire';
/** One decision of the loop: when `when` holds (and the spell is affordable), `cast` is cast and the loop starts over. */
export interface Step {
  when: string;
  /** Spell ids shown as icons. */
  spells: readonly string[];
  cast: string;
}

const TRANCE = (rank: string): Step => ({ when: 'Jest Shadow Trance (Nightfall)?', spells: ['shadow_bolt'], cast: `Shadow Bolt (${rank}), natychmiast` });
const BRAND: Step = { when: 'Pet żyje, a Demonic Brand bez ładunków lub kończy się (< 1,5 s)?', spells: ['searing_pain'], cast: 'Searing Pain (odświeża Brand)' };
const COE: Step = { when: 'Brak klątwy na celu, a cel pożyje dość długo?', spells: ['curse_of_elements'], cast: 'Curse of the Elements' };
const AGONY: Step = { when: 'Brak Bane of Agony, a cel pożyje dość długo?', spells: ['bane_of_agony'], cast: 'Bane of Agony' };
const CORRUPTION: Step = { when: 'Brak Corruption, a cel pożyje dość długo?', spells: ['corruption'], cast: 'Corruption' };
const SOUL: Step = { when: 'Masz Soul Harvest, a cel zginie w oknie kanału (DoT-y i pet)?', spells: ['drain_soul'], cast: 'Drain Soul (dobicie)' };

const TITLES: Record<Kind, string> = { affliction: 'Affliction (DoT-y + filler)', demonology: 'Demonology (Shadow Bolt + pet)', fire: 'Demonology/Fire (Immolate + Searing Pain)' };

/** The steps of a build's rotation, top to bottom: the first whose condition holds is cast, then the loop restarts. */
export function stepsFor(v: BuildVariant): readonly Step[] {
  const rank = v.rank === 'max' ? 'najwyższa ranga' : `ranga ${v.rank}`;
  const cheap: Step = { when: 'Nie stać na powyższy Shadow Bolt?', spells: ['shadow_bolt'], cast: 'Tańszy Shadow Bolt: ranga 2, potem 1' };
  switch (v.rotation) {
    case 'affliction':
      return [
        TRANCE('najwyższa ranga'),
        COE,
        AGONY,
        CORRUPTION,
        { when: 'Brak Siphon Life, a cel pożyje dość długo?', spells: ['siphon_life'], cast: 'Siphon Life' },
        { when: 'Immolate włączony w ustawieniach i brak go na celu?', spells: ['immolate'], cast: 'Immolate' },
        SOUL,
        v.filler === 'wrack'
          ? { when: 'Filler: masz Wrack?', spells: ['wrack'], cast: 'Wrack (kanał, przyspiesza DoT-y)' }
          : { when: 'Filler: 1 mob w pullu i masz Wrack?', spells: ['wrack'], cast: 'Wrack (kanał, przyspiesza DoT-y)' },
        { when: 'Znasz Drain Life?', spells: ['drain_life'], cast: 'Drain Life' },
        { when: 'Nie znasz Drain Life albo nie stać na niego?', spells: ['shadow_bolt'], cast: 'Shadow Bolt (najwyższa ranga)' },
        cheap,
      ];
    case 'demonology':
      return [TRANCE(rank), BRAND, COE, ...(v.rotation === 'demonology' ? [{ ...AGONY, when: 'Agony włączone w ustawieniach, brak jej na celu, cel pożyje dość długo?' }] : []), CORRUPTION, SOUL, { when: 'Zawsze (gdy nic wyżej nie pasuje)', spells: ['shadow_bolt'], cast: `Shadow Bolt (${rank})` }, cheap];
    default:
      return [
        TRANCE('ranga 1'),
        BRAND,
        { when: 'Brak Immolate na celu, a cel pożyje dość długo?', spells: ['immolate'], cast: 'Immolate' },
        { when: 'Zawsze (gdy nic wyżej nie pasuje)', spells: ['searing_pain', 'shadow_bolt'], cast: 'Filler: Searing Pain (albo Shadow Bolt r1, wg parametru fire_filler)' },
        { when: 'Nie stać na filler?', spells: ['shadow_bolt'], cast: 'Shadow Bolt ranga 1' },
      ];
  }
}

const PET_NAMES: Record<string, string> = { imp: 'Imp', voidwalker: 'Voidwalker', succubus: 'Succubus', felhunter: 'Felhunter' };
const FILLER_SPELLS: Record<string, string[]> = { wrack: ['wrack'], drain_life: ['drain_life'], shadow_bolt: ['shadow_bolt'], searing_pain: ['searing_pain'] };
const FILLER_NAMES: Record<string, string> = { wrack: 'Wrack', drain_life: 'Drain Life (tank)', shadow_bolt: 'Shadow Bolt', searing_pain: 'Searing Pain' };

function spellName(id: string): string {
  try {
    return getSpell(id).name;
  } catch {
    return id;
  }
}

/** The facts of a build (pet, Shadow Bolt rank, filler, talents) and its rotation as a flow diagram. */
export function RotationFlow({ v }: { v: BuildVariant }) {
  const id = v.id;
  const steps = stepsFor(v);
  return (
    <section className="fv-panel">
        <h2>{TITLES[v.rotation]}</h2>
        <ScenarioNote id={v.id} />
        <dl className="fv-facts fv-facts-icons">
          <dt>Pet</dt>
          <dd>
            {v.pet ? <IconTile kind="pet" id={v.pet} name={PET_NAMES[v.pet] ?? v.pet} size={28} /> : null}
            <span>
              {v.pet ? (PET_NAMES[v.pet] ?? v.pet) : 'brak'}
              {v.sacrificed ? `, poświęcony: ${PET_NAMES[v.sacrificed] ?? v.sacrificed}` : ''}
            </span>
          </dd>
          <dt>Shadow Bolt</dt>
          <dd>
            <IconTile kind="spell" id="shadow_bolt" name="Shadow Bolt" size={28} />
            <span>{v.rotation === 'fire' ? 'ranga 1' : v.rank === 'max' ? 'najwyższa ranga' : `ranga ${v.rank}`}</span>
          </dd>
          <dt>Filler</dt>
          <dd>
            {FILLER_SPELLS[v.filler]?.map((sp) => <IconTile key={sp} kind="spell" id={sp} name={spellName(sp)} size={28} />)}
            <span>{FILLER_NAMES[v.filler] ?? v.filler}</span>
          </dd>
          <dt>Talenty</dt>
          <dd>
            <span>
              {v.order.startsWith('custom:') ? 'własna kolejność' : v.order}
              {v.pre_respec_build ? ` (do respeca na levelu ${v.respec_level}: ${v.pre_respec_build})` : ''}
            </span>
          </dd>
        </dl>
        <p className="fv-note">Po każdym rzucie (GCD) sprawdzasz warunki od góry.</p>
        <p className="fv-note">Pierwszy spełniony, na którego czar Cię stać, jest rzucany, po czym wracasz na początek.</p>
        <p className="fv-note">Poza walką i przy niskim HP decyduje strategia Life Tapa (opcje zaawansowane).</p>
        <ol className="fv-flow" aria-label={`Diagram rotacji ${id}`}>
          <li className="fv-start">
            <span className="fv-node fv-node-start">Nowy GCD</span>
          </li>
          {steps.map((st) => (
            <li key={st.when + st.cast} className="fv-flow-row">
              <span className="fv-node fv-node-cond">{st.when}</span>
              <span className="fv-arrow">TAK →</span>
              <span className="fv-node fv-node-cast">
                <span className="fv-step-icons">
                  {st.spells.map((sp) => (
                    <span key={sp} title={spellName(sp)}>
                      <IconTile kind="spell" id={sp} name={spellName(sp)} size={32} />
                    </span>
                  ))}
                </span>
                <b>{st.cast}</b>
              </span>
              <span className="fv-loopstub" aria-hidden="true" />
              <span className="fv-no" aria-hidden="true">
                NIE ↓
              </span>
            </li>
          ))}
          <li className="fv-flow-row fv-flow-end">
            <span className="fv-node fv-node-cond">Nic nie pasuje albo brak many</span>
            <span className="fv-arrow">→</span>
            <span className="fv-node fv-node-cast">
              <span className="fv-step-icons">
                <span title="Life Tap">
                  <IconTile kind="spell" id="life_tap" name="Life Tap" size={32} />
                </span>
              </span>
              <b>Life Tap (wg strategii) albo chwila czekania</b>
            </span>
            <span className="fv-loopstub" aria-hidden="true" />
          </li>
        </ol>
        <p className="fv-note">↻ Każda gałąź „TAK” wraca do „Nowy GCD”. DoT-y, kanały i pet działają w tle między rzutami.</p>
    </section>
  );
}

/** One build's rotation (chosen from a dropdown). */
export function RotationsView({ ids = VARIANT_IDS }: { ids?: readonly string[] }) {
  const [id, setId] = useState(ids[0] as string);
  const v = loadVariant(ids.includes(id) ? id : (ids[0] as string));
  return (
    <>
      <div className="fv-row">
        <label>
          Build{' '}
          <select value={v.id} onChange={(e) => setId(e.target.value)}>
            {ids.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
      </div>
      <RotationFlow v={v} />
    </>
  );
}
