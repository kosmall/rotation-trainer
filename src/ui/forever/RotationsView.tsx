import { useMemo, useState } from 'react';
import { loadVariant, VARIANT_IDS, type BuildVariant } from '../../forever/builds';
import { rotationSpec, type Cond, type RotationSpec, type SpecStep } from '../../forever/rotation-spec';
import { petData } from '../../forever/stats';
import { TALENT_BY_ID } from '../../forever/talents';
import type { Params, PetKind } from '../../forever/types';
import { LoadoutRows, spellName, TITLES, wrackFloor } from './buildFacts';
import { IconTile } from './IconTile';

/** Before the build's own demon is learned another one stands in. */
function standInNote(pet: PetKind): string {
  const from = petData(pet).unlock as number;
  return from > 10 ? ` (od levelu ${from}; wcześniej Voidwalker)` : '';
}

const num = (x: number): string => String(Math.round(x * 100) / 100).replace('.', ',');
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A condition of the spec in words (Polish), with every number written out. */
export function describeCond(c: Cond): string {
  switch (c.op) {
    case 'true':
      return 'zawsze';
    case 'all':
      return c.of.map((x) => (x.op === 'any' ? `(${describeCond(x)})` : describeCond(x))).join(' i ');
    case 'any':
      return c.of.map((x) => (x.op === 'all' ? `(${describeCond(x)})` : describeCond(x))).join(' lub ');
    case 'not':
      if (c.of.op === 'target_has_dot') return `cel nie ma ${spellName(c.of.spell)}`;
      if (c.of.op === 'target_has_curse') return 'cel nie ma Twojej klątwy';
      return `nieprawda, że ${describeCond(c.of)}`;
    case 'proc':
      return 'masz Shadow Trance (Nightfall)';
    case 'knows':
      return `znasz ${spellName(c.spell)}`;
    case 'target_has_dot':
      return `cel ma ${spellName(c.spell)}`;
    case 'target_has_curse':
      return 'cel ma Twoją klątwę';
    case 'ttk_at_least':
      return `cel pożyje co najmniej ${num(c.sec)} s`;
    case 'ttk_at_most':
      return `cel pożyje najwyżej ${num(c.sec)} s`;
    case 'pet_alive':
      return 'pet żyje';
    case 'talent_rank_at_least':
      return `masz talent ${TALENT_BY_ID.get(c.id)?.name ?? c.id} (min. ${c.rank})`;
    case 'brand_needs_refresh':
      return `Demonic Brand bez ładunków albo kończy się za mniej niż ${num(c.marginSec)} s`;
    case 'drain_soul_kills_within':
      return `Drain Soul zabije cel po ${num(c.minSec)}-${num(c.maxSec)} s`;
    case 'mobs_in_pull_is':
      return `w walce jest ${c.count} mob`;
    case 'mana_pct_below':
      return `mana poniżej ${num(c.pct)}%`;
    case 'hp_pct_above':
      return `HP powyżej ${num(c.pct)}%`;
    case 'cooldown_ready':
      return `${spellName(c.spell)} gotowa`;
    case 'first_action_of_pull':
      return 'to pierwszy rzut pulla';
    case 'next_spell_in':
      return `następny czar z listy to ${c.spells.map(spellName).join(', ')}`;
    case 'next_step_is_filler':
      return 'następny czar z listy to filler';
    case 'combat_sec_at_least':
      return `od początku walki minęło co najmniej ${num(c.sec)} s`;
  }
}

const rankText = (s: SpecStep): string => (s.rank === 'max' ? 'najwyższa ranga' : `ranga ${s.rank}`);

/** Whether Eureka! is used before this step's spell (policy `filler`: before the filler steps; `pull_start`: shown on the start node). */
export function eurekaBefore(step: SpecStep, spec: RotationSpec): boolean {
  if (spec.eureka.policy === 'pull_start') return false;
  if (spec.eureka.policy === 'filler') return step.filler === true;
  return spec.eureka.affects.includes(step.spell);
}

const EUREKA_NOTES: Record<string, string> = {
  off: 'Eureka! jest wyłączona w ustawieniach (Gnomi racial Eureka!): pokazane jest zalecane miejsce, czyli przed pierwszym czarem, który modyfikuje.',
  pull_start: 'Eureka! jest używana na początku pulla, razem z pierwszym rzutem.',
  first_affected: 'Eureka! jest używana raz na 2 min, przed pierwszym z oznaczonych czarów (zalecane).',
  filler: 'Eureka! jest używana raz na 2 min, gdy zaczyna się filler (po DoT-ach).',
  delay: 'Eureka! jest używana raz na 2 min, przed pierwszym z oznaczonych czarów po zadanym czasie.',
  ttk: 'Eureka! jest używana raz na 2 min, przed oznaczonym czarem, gdy do zabicia moba zostało około 8 s lub mniej.',
};

/** The facts of a build (pet, Shadow Bolt rank, filler, talents) and its rotation, drawn from the rotation spec (JSON). */
export function RotationFlow({ v, params }: { v: BuildVariant; params: Params }) {
  const spec = useMemo(() => rotationSpec(v, params), [v, params]);
  const json = useMemo(() => JSON.stringify(spec, null, 2), [spec]);
  const id = v.id;
  const eurekaWhen = describeCond(spec.eureka.when);
  const ltWhen = describeCond(spec.lifeTap.when);
  const floor = wrackFloor(v, params);
  return (
    <section className="fv-panel">
      <h2>{TITLES[v.rotation]}</h2>
      <dl className="fv-facts fv-facts-icons">
        <LoadoutRows v={v} params={params} petNote={v.pet ? standInNote(v.pet) : ''} />
      </dl>
      <p className="fv-note">Po każdym rzucie (GCD) sprawdzasz warunki od góry. Pierwszy spełniony krok, na którego czar Cię stać, jest rzucany, po czym wracasz na początek.</p>
      <ol className="fv-flow" aria-label={`Diagram rotacji ${id}`}>
        <li className="fv-start">
          <span className="fv-node fv-node-start">Nowy GCD</span>
          {spec.eureka.policy === 'pull_start' && (
            <span className="fv-node fv-node-eureka" title="Eureka! (poza GCD)">
              <IconTile kind="spell" id="eureka" name="Eureka!" size={28} />
              <b>Eureka! na starcie pulla</b>
            </span>
          )}
        </li>
        <li className="fv-flow-row" data-step="life_tap">
          <span className="fv-node fv-node-cond">
            {cap(ltWhen)} (HP po Life Tapie nie niżej niż {num(spec.lifeTap.minHpAfterPct)}%)?
          </span>
          <span className="fv-arrow">TAK →</span>
          <span className="fv-node fv-node-cast">
            <span className="fv-step-icons">
              <span title="Life Tap">
                <IconTile kind="spell" id="life_tap" name="Life Tap" size={32} />
              </span>
            </span>
            <b>Life Tap</b>
          </span>
          <span className="fv-loopstub" aria-hidden="true" />
          <span className="fv-no" aria-hidden="true">
            NIE ↓
          </span>
        </li>
        {spec.steps.map((st) => (
          <li key={st.id} className="fv-flow-row" data-step={st.id}>
            <span className="fv-node fv-node-cond">{st.when.op === 'true' ? 'Zawsze (gdy nic wyżej nie pasuje)?' : `${cap(describeCond(st.when))}?`}</span>
            <span className="fv-arrow">TAK →</span>
            <span className="fv-node fv-node-cast">
              {eurekaBefore(st, spec) && (
                <span className={`fv-eureka${spec.eureka.enabled ? '' : ' fv-eureka-off'}`} title="Eureka! (poza GCD, 2 min odnowienia): -10% many i +10% obrażeń">
                  <IconTile kind="spell" id="eureka" name="Eureka!" size={32} />
                  <b>Eureka!</b>
                  <span aria-hidden="true">+</span>
                </span>
              )}
              <span className="fv-step-icons">
                <span title={spellName(st.spell)}>
                  <IconTile kind="spell" id={st.spell} name={spellName(st.spell)} size={32} />
                </span>
              </span>
              <b>
                {spellName(st.spell)} ({rankText(st)}){st.filler ? ', filler' : ''}
                {floor > 0 && st.id === 'filler_drain_life' ? `, filler przy HP ${num(floor * 100)}% i niższym` : ''}
              </b>
            </span>
            <span className="fv-loopstub" aria-hidden="true" />
            <span className="fv-no" aria-hidden="true">
              NIE ↓
            </span>
          </li>
        ))}
        <li className="fv-flow-row fv-flow-end">
          <span className="fv-node fv-node-cond">Nic z powyższych nie jest dostępne (brak many)</span>
          <span className="fv-arrow">→</span>
          <span className="fv-node fv-node-cast">
            <span className="fv-step-icons">
              <span title="Life Tap">
                <IconTile kind="spell" id="life_tap" name="Life Tap" size={32} />
              </span>
            </span>
            <b>
              {spec.fallback.lifeTapWhenOutOfMana
                ? `Life Tap (HP po nim nie niżej niż ${num(spec.lifeTap.minHpAfterPct)}%), inaczej czekaj ${num(spec.fallback.waitSec)} s`
                : `Czekaj ${num(spec.fallback.waitSec)} s`}
            </b>
          </span>
          <span className="fv-loopstub" aria-hidden="true" />
        </li>
      </ol>
      <p className="fv-note">
        {EUREKA_NOTES[spec.eureka.policy] ?? EUREKA_NOTES.off} Warunek: {eurekaWhen}. Eureka! kosztuje 0 GCD, więc po jej użyciu rzucasz dalej oznaczony czar.
      </p>
      <p className="fv-note">↻ Każda gałąź „TAK” wraca do „Nowy GCD”. DoT-y, kanały i pet działają w tle między rzutami.</p>
      <p className="fv-note">
        Szacowany czas do zabicia = obecne HP celu / Twoje obrażenia na sekundę (filler przy 90% uptime plus pet). Addon musi odczytać: {spec.reads.join('; ')}.
      </p>
      <details className="fv-json">
        <summary>JSON rotacji (źródło tego diagramu, do szablonów addonu)</summary>
        <p>
          <a className="btn" download={`${id.replace(/[^A-Za-z0-9_-]+/g, '_')}.rotation.json`} href={`data:application/json;charset=utf-8,${encodeURIComponent(json)}`}>
            Pobierz JSON
          </a>
        </p>
        <pre aria-label={`JSON rotacji ${id}`}>{json}</pre>
      </details>
    </section>
  );
}

/** One build's rotation (chosen from a dropdown). */
export function RotationsView({ ids = VARIANT_IDS, params }: { ids?: readonly string[]; params: Params }) {
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
      <RotationFlow v={v} params={params} />
    </>
  );
}
