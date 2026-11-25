import { DEFAULT_SETTINGS, MAX_LEVEL, MIN_LEVEL, POLICIES, POLICY_IDS, type Settings } from '../../forever/web/api';
import { PROFILE_IDS } from '../../forever/stats';
import type { ForeverRun } from './useForeverRun';

const PROFILE_LABEL: Record<string, string> = { quest: 'questowy', average: 'przeciętny', good: 'dobry' };

/** The one main setting (the character's level) plus collapsed advanced options and the Run button. */
export function SettingsBar({ settings, onChange, run, onRun, runLabel = 'Uruchom symulację' }: { settings: Settings; onChange(s: Settings): void; run: ForeverRun; onRun(): void; runLabel?: string }) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const running = run.status === 'running';
  return (
    <section className="fv-panel" aria-label="Ustawienia symulacji">
      <div className="fv-row">
        <label htmlFor="fv-level">
          Level postaci: <b>{settings.level}</b>
        </label>
        <input id="fv-level" type="range" min={MIN_LEVEL} max={MAX_LEVEL} value={settings.level} onChange={(e) => set({ level: Number(e.target.value) })} />
        <input aria-label="Level postaci (liczba)" type="number" min={MIN_LEVEL} max={MAX_LEVEL} value={settings.level} onChange={(e) => set({ level: Number(e.target.value) })} className="fv-num" />
        {running ? (
          <button type="button" className="btn" onClick={run.cancel}>
            Anuluj
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={onRun}>
            {runLabel}
          </button>
        )}
      </div>
      {running && (
        <p role="status" aria-live="polite" className="fv-progress">
          <progress value={run.done} max={Math.max(1, run.total)} /> {run.done}/{run.total}
        </p>
      )}
      {run.error && (
        <p role="alert" className="fv-error">
          Błąd symulacji: {run.error}
        </p>
      )}
      <details className="fv-adv">
        <summary>Opcje zaawansowane</summary>
        <div className="fv-grid">
          <label>
            Sprzęt
            <select value={settings.profile} onChange={(e) => set({ profile: e.target.value })}>
              {PROFILE_IDS.map((p) => (
                <option key={p} value={p}>
                  {PROFILE_LABEL[p] ?? p}
                </option>
              ))}
            </select>
          </label>
          <label>
            Moby na pull
            <select value={settings.mobs} onChange={(e) => set({ mobs: Number(e.target.value) === 2 ? 2 : 1 })}>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
          <label>
            Strategia Life Tapa i przerw
            <select value={settings.policy} onChange={(e) => set({ policy: e.target.value })}>
              {POLICY_IDS.map((p) => (
                <option key={p} value={p}>
                  {POLICIES[p]?.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Major Spellstone (+2% haste, +21 obr. Shadow)</span>
            <input type="checkbox" checked={settings.spellstone} onChange={(e) => set({ spellstone: e.target.checked })} />
          </label>
          <label>
            Sesje
            <input type="number" min={5} max={500} value={settings.sessions} onChange={(e) => set({ sessions: Number(e.target.value) })} />
          </label>
          <label>
            Seed
            <input type="number" value={settings.seed} onChange={(e) => set({ seed: Number(e.target.value) })} />
          </label>
        </div>
        <p className="fv-note">{POLICIES[settings.policy]?.description}</p>
        <button type="button" className="btn" onClick={() => onChange(DEFAULT_SETTINGS)}>
          Przywróć domyślne
        </button>
      </details>
    </section>
  );
}
