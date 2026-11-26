import { useEffect, useMemo, useState } from 'react';
import { customVariant, loadVariant, picksAt, VARIANT_IDS } from '../../forever/builds';
import { MAX_TALENT_POINTS, pointsAtLevel, TALENT_BY_ID, validatePicks } from '../../forever/talents';
import { DEFAULT_GENES, FILLERS, PETS, ROTATIONS, customId, emptyBuild, exportBuild, parseBuild, uniqueName, type CustomBuildData, type CustomState } from '../../forever/web/custom';
import { FILLER_NAME, FILLERS as GENE_FILLERS, MIN_TTKS, type RotationGenes } from '../../forever/rotation-genes';
import { paramsOf, type RankingResult, type Settings } from '../../forever/web/api';
import { FILLER_NAMES, PET_NAMES, TITLES } from './buildFacts';
import { RotationFlow } from './RotationsView';
import { RankingTable } from './SimView';
import { TalentTrees } from './TalentTrees';
import type { ForeverRun } from './useForeverRun';

/** Where the player builds their own talent order and picks a rotation template; the build joins the simulations. */
export function CustomView({ state, onChange, settings, run, ranking, onRun }: { state: CustomState; onChange(s: CustomState): void; settings: Settings; run: ForeverRun; ranking: RankingResult | undefined; onRun(): void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [io, setIo] = useState('');
  const [fromBuiltIn, setFromBuiltIn] = useState(VARIANT_IDS[0] as string);

  // Entering the tab with nothing saved shows an empty tree: create the first (empty) build.
  useEffect(() => {
    if (state.builds.length === 0) {
      const b = emptyBuild('Własny build');
      onChange({ builds: [b], active: b.name, included: [] });
    } else if (state.active === null) onChange({ ...state, active: state.builds[state.builds.length - 1]?.name ?? null });
  }, [state, onChange]);

  const build = state.builds.find((b) => b.name === state.active);
  const names = state.builds.map((b) => b.name);
  const variant = useMemo(() => {
    if (!build) return null;
    try {
      return customVariant(build);
    } catch {
      return null;
    }
  }, [build]);
  if (!build) return null;

  const update = (patch: Partial<CustomBuildData>, newActive?: string) => {
    setMessage(null);
    const next = { ...build, ...patch };
    onChange({ ...state, builds: state.builds.map((b) => (b === build ? next : b)), active: newActive ?? next.name, included: state.included.map((n) => (n === build.name ? next.name : n)) });
  };
  const add = (b: CustomBuildData) => onChange({ builds: [...state.builds, b], active: b.name, included: state.included });
  const setPicks = (picks: string[], what: string) => {
    if (picks.length > MAX_TALENT_POINTS || !validatePicks(picks).ok) {
      setMessage(`Nie można: ${what}. Kolejne punkty wymagają tego talentu albo odpowiedniej liczby punktów w drzewie.`);
      return;
    }
    update({ picks });
  };

  const result = validatePicks(build.picks);
  const lvlPoints = pointsAtLevel(settings.level);
  const unmodelled = [...new Set(build.picks)].filter((id) => TALENT_BY_ID.get(id)?.status === 'unmodelled').map((id) => TALENT_BY_ID.get(id)?.name ?? id);
  const usedAtLevel = Math.min(build.picks.length, lvlPoints);
  const rotationFillers = FILLERS[build.rotation];
  const included = state.included.includes(build.name);
  const mine = customId(build.name);

  return (
    <>
      <div className="fv-row">
        <label>
          Build{' '}
          <select value={build.name} onChange={(e) => onChange({ ...state, active: e.target.value })}>
            {names.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Nazwa{' '}
          <input
            type="text"
            value={build.name}
            maxLength={40}
            onChange={(e) => {
              const v = e.target.value;
              if (v.trim() && !names.filter((n) => n !== build.name).includes(v)) update({ name: v });
            }}
          />
        </label>
        <button type="button" className="btn" onClick={() => add(emptyBuild(uniqueName('Własny build', names)))}>
          Nowy (pusty)
        </button>
        <button type="button" className="btn" onClick={() => add({ ...build, picks: [...build.picks], name: uniqueName(`${build.name} (kopia)`, names) })}>
          Duplikuj
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const rest = state.builds.filter((b) => b !== build);
            if (rest.length === 0) onChange({ builds: [emptyBuild('Własny build')], active: 'Własny build', included: [] });
            else onChange({ builds: rest, active: rest[rest.length - 1]?.name ?? null, included: state.included.filter((n) => n !== build.name) });
          }}
        >
          Usuń
        </button>
      </div>
      <div className="fv-row">
        <label>
          Zacznij od wbudowanego{' '}
          <select value={fromBuiltIn} onChange={(e) => setFromBuiltIn(e.target.value)}>
            {VARIANT_IDS.map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const v = loadVariant(fromBuiltIn);
            const picks = picksAt(v, 60);
            add({ name: uniqueName(`${fromBuiltIn} (kopia)`, names), picks, rotation: v.rotation, filler: v.filler, rank: v.rank, pet: v.pet, sacrificed: v.sacrificed });
          }}
        >
          Kopiuj do nowego buildu
        </button>
      </div>

      <h2>Talenty</h2>
      <p className="fv-note">
        Klik w talent dodaje punkt (kolejność kliknięć to kolejność rozdawania, pierwszy punkt na levelu 10). Prawy klik albo „−” usuwa ostatni punkt tego talentu.
      </p>
      <TalentTrees
        ranks={result.ranks}
        perTree={result.pointsPerTree}
        editing={{
          canAdd: (id) => build.picks.length < MAX_TALENT_POINTS && validatePicks([...build.picks, id]).ok,
          onAdd: (id) => setPicks([...build.picks, id], 'dodać punkt'),
          onRemove: (id) => {
            const i = build.picks.lastIndexOf(id);
            if (i >= 0) setPicks(build.picks.filter((_, k) => k !== i), `usunąć punkt ${TALENT_BY_ID.get(id)?.name ?? id}`);
          },
        }}
      />
      <p role="status" className="fv-note">
        Punkty: <b>{build.picks.length}/{MAX_TALENT_POINTS}</b>. Na levelu {settings.level} masz {lvlPoints} punktów, wykorzystane z buildu: {usedAtLevel}
        {build.picks.length < lvlPoints ? ` (${lvlPoints - build.picks.length} niewydanych: symulator ich nie użyje)` : ''}.
      </p>
      {message && (
        <p role="alert" className="fv-error">
          {message}
        </p>
      )}
      {unmodelled.length > 0 && (
        <p className="fv-warn">
          Symulator nie modeluje efektu talentów: {unmodelled.join(', ')}. Punkty w nich nie wpływają na wynik, więc build może wyglądać słabiej lub lepiej niż w grze.
        </p>
      )}

      <h3>Kolejność punktów</h3>
      <ol className="fv-points" aria-label="Kolejność punktów">
        {build.picks.map((id, i) => (
          <li key={`${i}-${id}`}>
            <span className="lvl">lvl {i + 10}</span>
            <span>{TALENT_BY_ID.get(id)?.name ?? id}</span>
            <button type="button" className="btn" aria-label={`W górę: punkt ${i + 1}`} disabled={i === 0} onClick={() => setPicks(swap(build.picks, i, i - 1), 'zmienić kolejność')}>
              ↑
            </button>
            <button type="button" className="btn" aria-label={`W dół: punkt ${i + 1}`} disabled={i === build.picks.length - 1} onClick={() => setPicks(swap(build.picks, i, i + 1), 'zmienić kolejność')}>
              ↓
            </button>
            <button type="button" className="btn" aria-label={`Usuń punkt ${i + 1}`} onClick={() => setPicks(build.picks.filter((_, k) => k !== i), 'usunąć punkt')}>
              ✕
            </button>
          </li>
        ))}
      </ol>

      <h2>Rotacja</h2>
      <div className="fv-grid">
        <label>
          Szablon rotacji
          <select
            value={build.genes ? 'custom' : build.rotation}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                update({ genes: { ...DEFAULT_GENES } });
                return;
              }
              const rotation = e.target.value as CustomBuildData['rotation'];
              update({ rotation, filler: FILLERS[rotation][0] as string, rank: rotation === 'demonology' ? 1 : 'max', genes: undefined });
            }}
          >
            {ROTATIONS.map((r) => (
              <option key={r} value={r}>
                {TITLES[r]}
              </option>
            ))}
            <option value="custom">Własna (z klocków)</option>
          </select>
        </label>
        {build.genes && <GeneControls genes={build.genes} onChange={(genes) => update({ genes })} />}
        {!build.genes && rotationFillers.length > 1 && (
          <label>
            Filler
            <select value={build.filler} onChange={(e) => update({ filler: e.target.value })}>
              {rotationFillers.map((f) => (
                <option key={f} value={f}>
                  {FILLER_NAMES[f] ?? f}
                </option>
              ))}
            </select>
          </label>
        )}
        {!build.genes && build.rotation === 'demonology' && (
          <label>
            Ranga Shadow Bolta
            <select value={String(build.rank)} onChange={(e) => update({ rank: e.target.value === 'max' ? 'max' : e.target.value === '2' ? 2 : 1 })}>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="max">najwyższa</option>
            </select>
          </label>
        )}
        <label>
          Pet
          <select value={build.pet ?? ''} onChange={(e) => update({ pet: e.target.value === '' ? null : (e.target.value as CustomBuildData['pet']) })}>
            <option value="">brak</option>
            {PETS.map((p) => (
              <option key={p} value={p}>
                {PET_NAMES[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pet poświęcony (Demonic Sacrifice)
          <select value={build.sacrificed ?? ''} onChange={(e) => update({ sacrificed: e.target.value === '' ? null : (e.target.value as CustomBuildData['sacrificed']) })}>
            <option value="">brak</option>
            {PETS.map((p) => (
              <option key={p} value={p}>
                {PET_NAMES[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {variant && <RotationFlow v={variant} params={paramsOf(settings)} />}

      <h2>Symulacja</h2>
      <p className="fv-note">Od levelu 40 liczy się tylko ten build (respec na 40 daje wszystkie punkty naraz).</p>
      <div className="fv-row">
        <label>
          <input type="checkbox" checked={included} onChange={(e) => onChange({ ...state, included: e.target.checked ? [...state.included, build.name] : state.included.filter((n) => n !== build.name) })} /> Dołącz do rankingu w zakładce Symulacja
        </label>
        <button type="button" className="btn primary" disabled={run.status === 'running' || build.picks.length === 0} onClick={onRun}>
          Sprawdź na levelu {settings.level}
        </button>
      </div>
      {ranking && ranking.rows.some((r) => r.metrics.variant === mine) && (
        <>
          <p className="fv-note">
            Ranking na levelu {ranking.settings.level}: wbudowane buildy i Twój build (podświetlony).
          </p>
          <RankingTable ranking={ranking} highlight={mine} />
        </>
      )}

      <h2>Eksport i import</h2>
      <textarea className="fv-io" aria-label="Build jako JSON" value={io} onChange={(e) => setIo(e.target.value)} placeholder="Tu pojawi się JSON buildu albo wklej JSON do importu" />
      <div className="fv-row">
        <button type="button" className="btn" onClick={() => setIo(exportBuild(build))}>
          Eksportuj bieżący
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            try {
              const b = parseBuild(JSON.parse(io));
              add({ ...b, name: uniqueName(b.name, names) });
              setMessage(null);
            } catch (e) {
              setMessage(`Import nie powiódł się: ${e instanceof Error ? e.message : String(e)}`);
            }
          }}
        >
          Importuj jako nowy
        </button>
      </div>
    </>
  );
}

function swap(a: readonly string[], i: number, j: number): string[] {
  const out = [...a];
  [out[i], out[j]] = [out[j] as string, out[i] as string];
  return out;
}

const GENE_FLAGS: readonly [keyof RotationGenes, string][] = [
  ['coe', 'Curse of the Elements'],
  ['agony', 'Bane of Agony'],
  ['corruption', 'Corruption'],
  ['siphon', 'Siphon Life'],
  ['immolate', 'Immolate'],
  ['drainSoulFinisher', 'Drain Soul na dobicie'],
];

/** The blocks of a rotation composed from spells: maintained effects, their time-to-kill floor, the finisher and the filler. */
function GeneControls({ genes, onChange }: { genes: RotationGenes; onChange(g: RotationGenes): void }) {
  return (
    <>
      {GENE_FLAGS.map(([key, label]) => (
        <label key={key} className="fv-inline">
          <input type="checkbox" checked={genes[key] as boolean} onChange={(e) => onChange({ ...genes, [key]: e.target.checked })} /> {label}
        </label>
      ))}
      <label>
        DoT-y gdy TTK ≥
        <select value={String(genes.minTtkSec)} onChange={(e) => onChange({ ...genes, minTtkSec: Number(e.target.value) as RotationGenes['minTtkSec'] })}>
          {MIN_TTKS.map((t) => (
            <option key={t} value={String(t)}>
              {t === 0 ? 'zawsze' : `${t} s`}
            </option>
          ))}
        </select>
      </label>
      <label>
        Filler
        <select value={genes.filler} onChange={(e) => onChange({ ...genes, filler: e.target.value as RotationGenes['filler'] })}>
          {GENE_FILLERS.map((f) => (
            <option key={f} value={f}>
              {FILLER_NAME[f]}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
