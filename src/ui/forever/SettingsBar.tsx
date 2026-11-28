import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, EUREKA_CHOICES, MAX_LEVEL, MIN_LEVEL, POLICIES, POLICY_IDS, type Settings } from '../../forever/web/api';
import { PROFILE_IDS } from '../../forever/stats';
import type { ForeverRun } from './useForeverRun';

const clampInt = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));
/** The typed text as a whole number inside [min, max], else null (empty, partial like "4" under a minimum of 10, out of range, fractional). */
const validInt = (text: string, min: number, max: number): number | null => {
  const n = text.trim() === '' ? NaN : Number(text);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/**
 * A number input that keeps the raw text while it is edited: the stored setting changes only to valid whole numbers
 * (so typing 45 digit by digit passes through "4", which is not committed), and the text is normalised on blur or Enter.
 * A change of the stored value from outside (slider, defaults) drops the draft.
 */
function NumberField({ value, min, max, onCommit, ...rest }: { value: number; min: number; max: number; onCommit(n: number): void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'type'>) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    setDraft((d) => (d !== null && validInt(d, min, max) !== value ? null : d));
  }, [value, min, max]);
  const finish = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n)) onCommit(clampInt(n, min, max));
    setDraft(null);
  };
  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      value={draft ?? value}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = validInt(text, min, max);
        if (n !== null) onCommit(n);
      }}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish();
      }}
    />
  );
}

const PROFILE_LABEL: Record<string, string> = { quest: 'questowy', average: 'przeciętny', good: 'dobry' };

/** The one main setting (the character's level) plus collapsed advanced options and the Run button. */
export function SettingsBar({ settings, hasGear = false, onChange, run, onRun, runLabel = 'Uruchom symulację' }: { settings: Settings; hasGear?: boolean; onChange(s: Settings): void; run: ForeverRun; onRun(): void; runLabel?: string }) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const running = run.status === 'running';
  return (
    <section className="fv-panel" aria-label="Ustawienia symulacji">
      <div className="fv-row">
        <label htmlFor="fv-level">
          Level postaci: <b>{settings.level}</b>
        </label>
        <input id="fv-level" type="range" min={MIN_LEVEL} max={MAX_LEVEL} value={settings.level} onChange={(e) => set({ level: Number(e.target.value) })} />
        <NumberField aria-label="Level postaci (liczba)" min={MIN_LEVEL} max={MAX_LEVEL} value={settings.level} onCommit={(level) => set({ level })} className="fv-num" />
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
              {hasGear && <option value="mine">mój sprzęt (zaimportowany)</option>}
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
            Gnomi racial Eureka! (-10% many, +10% obrażeń)
            <select value={settings.eureka} onChange={(e) => set({ eureka: e.target.value as Settings['eureka'] })}>
              {Object.entries(EUREKA_CHOICES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sesje
            <NumberField min={5} max={500} value={settings.sessions} onCommit={(sessions) => set({ sessions })} />
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
