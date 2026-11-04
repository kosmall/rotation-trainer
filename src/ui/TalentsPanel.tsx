import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TalentPreset } from '../data/classes/warlock/talentPresets';
import { destructionTalentString } from '../data/classes/warlock/talents';
import {
  loadTalentDescriptions,
  TALENT_POINTS_MAX,
  TALENT_TREE,
  talentById,
  type TalentDef,
  type TalentDescriptions,
} from '../data/classes/warlock/talentTree';
import { exportTalents } from '../setup/wowsimsGear';
import { initials } from './format';
import { SpellIcon } from './SpellIcon';
import {
  addPoint,
  buildSummary,
  matchingTalentPreset,
  pointsText,
  ranksOf,
  readTalentImport,
  removePoint,
  talentBuildName,
  talentView,
  treePoints,
  CUSTOM_TALENTS_NAME,
  type TalentEdit,
  type TalentView,
} from './talentView';

type DescriptionState = { status: 'idle' | 'loading' | 'error'; data?: undefined } | { status: 'ready'; data: TalentDescriptions };

export interface TalentsPanelProps {
  /** The setup's build as a talent string (`setupTalents(config)`). The panel keeps no copy of it. */
  talents: string;
  /** The preset buttons, in order (`offeredTalentPresets()`). */
  presets: readonly Readonly<TalentPreset>[];
  /**
   * Receives every edit as a new full-width talent string, already through the validators
   * (`canAddPoint` / `canRemovePoint`, `validateTalents`, or the import's `applyImportedTalents`);
   * the caller puts it into the setup and runs `normalizeSetup`.
   */
  onChange(talents: string): void;
  disabled?: boolean;
  /** The running fight was built with other talents: the new build applies after R. */
  pending?: boolean;
  fightEnded?: boolean;
  /** Rotation steps the build cannot play (`rotationWarnings`). */
  warnings?: readonly string[];
  /** Loads the rank descriptions (default `loadTalentDescriptions`, a lazy chunk), asked for when the panel first opens. */
  loadDescriptions?: () => Promise<TalentDescriptions>;
  /** The build "Reset to my build" restores (default: the author's). */
  defaultTalents?: string;
}

/**
 * The collapsed "Talents" panel: presets (pressed when the build equals one, else "Custom"), Reset
 * to my build, the points per tree and left, the three trees as grids (a button per talent: click,
 * Enter or Space adds a point; right click, Shift+Enter or the details card's − removes one), a
 * details card with the rank descriptions (loaded lazily) and whether the talent is modelled, the
 * modelled / not modelled summary, the rotation warnings, import and export of the talent string.
 * Fully controlled; the trees are rendered only while the panel is open. Memoized: GameView
 * renders every animation frame.
 */
export const TalentsPanel = memo(function TalentsPanel({
  talents,
  presets,
  onChange,
  disabled = false,
  pending = false,
  fightEnded = false,
  warnings = [],
  loadDescriptions = loadTalentDescriptions,
  defaultTalents = destructionTalentString,
}: TalentsPanelProps) {
  const [open, setOpen] = useState(false);
  const [descriptions, requestDescriptions] = useTalentDescriptions(loadDescriptions);

  useEffect(() => {
    if (open) requestDescriptions();
  }, [open, requestDescriptions]);

  return (
    <details className="panel setup talents" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Talents</summary>
      {open && (
        <fieldset className="setup-fields" disabled={disabled}>
          <TalentsBody
            talents={talents}
            presets={presets}
            onChange={onChange}
            pending={pending}
            fightEnded={fightEnded}
            warnings={warnings}
            descriptions={descriptions}
            onRetry={requestDescriptions}
            defaultTalents={defaultTalents}
          />
        </fieldset>
      )}
    </details>
  );
});

/** The rank descriptions: loaded once when first asked for (a failed load is not cached: Try again asks once more). */
function useTalentDescriptions(loadDescriptions: () => Promise<TalentDescriptions>): [DescriptionState, () => void] {
  const [descriptions, setDescriptions] = useState<DescriptionState>({ status: 'idle' });
  const requested = useRef(false);
  const requestDescriptions = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    setDescriptions({ status: 'loading' });
    let pendingLoad: Promise<TalentDescriptions>;
    try {
      pendingLoad = loadDescriptions();
    } catch (error) {
      pendingLoad = Promise.reject(error);
    }
    pendingLoad.then(
      (data) => setDescriptions({ status: 'ready', data }),
      () => {
        requested.current = false;
        setDescriptions({ status: 'error' });
      },
    );
  }, [loadDescriptions]);
  return [descriptions, requestDescriptions];
}

/**
 * The Talents editor without the panel's `<details>` (the Setup screen's Talents section): the same
 * body as the legacy panel; the rank descriptions load when it mounts. The three trees sit side by
 * side from 1280 px (setup.css).
 */
export function TalentsEditor({
  talents,
  presets,
  onChange,
  disabled = false,
  pending = false,
  fightEnded = false,
  warnings = [],
  loadDescriptions = loadTalentDescriptions,
  defaultTalents = destructionTalentString,
}: TalentsPanelProps) {
  const [descriptions, requestDescriptions] = useTalentDescriptions(loadDescriptions);
  useEffect(() => {
    requestDescriptions();
  }, [requestDescriptions]);
  return (
    <fieldset className="setup-fields talents-editor" disabled={disabled}>
      <TalentsBody
        talents={talents}
        presets={presets}
        onChange={onChange}
        pending={pending}
        fightEnded={fightEnded}
        warnings={warnings}
        descriptions={descriptions}
        onRetry={requestDescriptions}
        defaultTalents={defaultTalents}
      />
    </fieldset>
  );
}

interface BodyProps {
  talents: string;
  presets: readonly Readonly<TalentPreset>[];
  onChange(talents: string): void;
  pending: boolean;
  fightEnded: boolean;
  warnings: readonly string[];
  descriptions: DescriptionState;
  onRetry(): void;
  defaultTalents: string;
}

function TalentsBody({ talents, presets, onChange, pending, fightEnded, warnings, descriptions, onRetry, defaultTalents }: BodyProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const ranks = useMemo(() => ranksOf(talents), [talents]);
  const views = useMemo(
    () => new Map(TALENT_TREE.trees.flatMap((t) => t.talents).map((d) => [d.id, talentView(ranks, d)] as const)),
    [ranks],
  );
  const points = treePoints(ranks);
  const active = matchingTalentPreset(talents, presets);
  const summary = useMemo(() => buildSummary(ranks), [ranks]);

  const edit = (result: TalentEdit) => {
    if (result.ok) {
      onChange(result.talents);
      setStatus(result.message);
    } else setStatus(result.reason);
  };
  const add = (id: string) => edit(addPoint(talents, id));
  const remove = (id: string) => edit(removePoint(talents, id));
  const choose = (next: string, message: string) => {
    onChange(next);
    setStatus(message);
  };

  const selectedView = selected === null ? undefined : views.get(selected);

  return (
    <>
      <div className="setup-presets">
        <p className="setup-active">
          Build:{' '}
          <span role="note" aria-label="Active talent build" className="setup-active-name">
            {active?.name ?? CUSTOM_TALENTS_NAME}
          </span>
        </p>
        <p className="setup-active talent-points-line">
          Points:{' '}
          <span aria-label="Talent points" className="talent-points">
            {pointsText(points)}
          </span>
        </p>
        {active && <p className="hint setup-preset-description">{active.phaseNote}</p>}
        <div className="setup-preset-buttons" role="group" aria-label="Talent presets">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              title={`${p.phaseNote} Source: ${p.source}.`}
              aria-pressed={active?.id === p.id}
              onClick={(e) => {
                if (e.detail > 0) e.currentTarget.blur(); // a pointer click: keep Space/R for the fight
                choose(p.talents, `Build: ${p.name}.`);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="setup-preset-buttons">
          <button
            type="button"
            onClick={(e) => {
              if (e.detail > 0) e.currentTarget.blur();
              choose(defaultTalents, `Build: ${talentBuildName(defaultTalents, presets)}.`);
            }}
          >
            Reset to my build
          </button>
        </div>
        <p className="hint">
          Click a talent (or Enter, Space) to add a point; right click, Shift+Enter or − in the details to remove one. Talents apply
          to a fight that has not started; a running fight keeps its build until you press <kbd>R</kbd>. The Setup presets keep
          the talents; Reset to defaults there restores your build.
        </p>
        {pending && (
          <p className="setup-pending">
            The {fightEnded ? 'finished' : 'running'} fight keeps its talents: the new build applies from the next fight (press R).
          </p>
        )}
        <p role="status" aria-label="Talent editor status" className="talent-status">
          {status}
        </p>
        {warnings.length > 0 && (
          <ul className="setup-warnings" aria-label="Rotation warnings">
            {warnings.map((w) => (
              <li key={w} className="setup-warn">
                {w}
              </li>
            ))}
          </ul>
        )}
        <p aria-label="Modelled talents" className="talent-modelled">
          Modelled: {summary.modelledPoints} of {TALENT_POINTS_MAX} points; not modelled: {summary.unmodelledPoints}.
        </p>
        {summary.left > 0 && <p className="setup-warn">{summary.left} talent points unspent.</p>}
        {summary.unmodelled.length > 0 && (
          <details className="setup-group">
            <summary>Not modelled talents ({summary.unmodelled.length})</summary>
            <ul className="setup-unmodelled" aria-label="Not modelled talents in this build">
              {summary.unmodelled.map((u) => (
                <li key={u.id}>{`${u.name} ${u.rank}/${u.maxRank}: ${u.reason}`}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="talent-trees">
        {TALENT_TREE.trees.map((tree, t) => (
          <section key={tree.name} className="talent-tree" role="group" aria-label={`${tree.name} tree`}>
            <h4 className="talent-tree-title">
              {tree.name} <span className="talent-tree-points">{points[t]}</span>
            </h4>
            <div className="talent-grid">
              {tree.talents.map((d) => (d.prereq ? <PrereqArrow key={`arrow-${d.id}`} def={d} ranks={ranks} /> : null))}
              {tree.talents.map((d) => (
                <TalentButton
                  key={d.id}
                  view={views.get(d.id)!}
                  selected={selected === d.id}
                  onSelect={() => setSelected(d.id)}
                  onAdd={() => add(d.id)}
                  onRemove={() => remove(d.id)}
                />
              ))}
            </div>
            {selectedView && selectedView.def.tree === t && (
              <TalentCard view={selectedView} descriptions={descriptions} onRetry={onRetry} onAdd={add} onRemove={remove} />
            )}
          </section>
        ))}
      </div>
      {!selectedView && <p className="hint">Point at a talent (or focus it) for its description.</p>}

      <TalentImport presets={presets} onApply={choose} />
      <TalentExport talents={exportTalents(ranks)} />
    </>
  );
}

/** A line from a prerequisite down to the talent that needs it (same column in every tree). */
function PrereqArrow({ def, ranks }: { def: TalentDef; ranks: Readonly<Record<string, number>> }) {
  const p = talentById(def.prereq);
  if (!p) return null;
  const met = (ranks[p.id] ?? 0) >= p.maxRank;
  const style = { '--talent-col': def.col + 1, '--talent-row': p.row + 1, '--talent-row-end': def.row + 1 } as CSSProperties;
  return <span className={met ? 'talent-arrow talent-arrow-on' : 'talent-arrow'} data-prereq={`${p.id}:${def.id}`} aria-hidden="true" style={style} />;
}

function TalentButton({
  view,
  selected,
  onSelect,
  onAdd,
  onRemove,
}: {
  view: TalentView;
  selected: boolean;
  onSelect(): void;
  onAdd(): void;
  onRemove(): void;
}) {
  const { def, rank, state, unmodelled } = view;
  const style = { '--talent-col': def.col + 1, '--talent-row': def.row + 1 } as CSSProperties;
  const cls = ['talent', `talent-${state}`, rank > 0 ? 'talent-has-points' : '', unmodelled ? 'talent-unmodelled' : '', selected ? 'talent-selected' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={cls}
      style={style}
      aria-label={view.label}
      onFocus={onSelect}
      onMouseEnter={onSelect}
      onClick={(e) => {
        onSelect();
        onAdd();
        if (e.detail > 0) e.currentTarget.blur(); // a pointer click: keep Space/R for the fight
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect();
        onRemove();
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' && e.shiftKey) || e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault(); // no click: Shift+Enter removes
          onRemove();
        }
      }}
    >
      <span className="talent-icon" aria-hidden="true">
        {initials(def.name)}
        <SpellIcon icon={def.icon} kind="talent" className="setup-icon-image" />
      </span>
      <span className="talent-rank" aria-hidden="true">
        {rank}/{def.maxRank}
      </span>
      {unmodelled && (
        <span className="talent-unmodelled-mark" aria-hidden="true" title="Not modelled">
          !
        </span>
      )}
    </button>
  );
}

function TalentCard({
  view,
  descriptions,
  onRetry,
  onAdd,
  onRemove,
}: {
  view: TalentView;
  descriptions: DescriptionState;
  onRetry(): void;
  onAdd(id: string): void;
  onRemove(id: string): void;
}) {
  const { def, rank, add, unmodelled } = view;
  const texts = descriptions.status === 'ready' ? (descriptions.data[def.id] ?? []) : [];
  const text = (r: number) => texts[r - 1] || 'No description.';
  return (
    <section className="talent-card" role="region" aria-label="Talent details">
      <p className="talent-card-title">
        <strong>{def.name}</strong> <span className="talent-card-rank">{`${rank}/${def.maxRank}`}</span>
      </p>
      {descriptions.status === 'ready' ? (
        <>
          {rank > 0 && (
            <p className="talent-card-text">
              <span className="talent-card-label">{`Rank ${rank}:`}</span> <span>{text(rank)}</span>
            </p>
          )}
          {rank < def.maxRank && (
            <p className="talent-card-text">
              <span className="talent-card-label">{`Next rank (${rank + 1}):`}</span> <span>{text(rank + 1)}</span>
            </p>
          )}
        </>
      ) : descriptions.status === 'error' ? (
        <div className="talent-card-text">
          <p>The description could not load.</p>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : (
        <p className="hint">Loading the description…</p>
      )}
      {unmodelled ? <p className="setup-warn">Not modelled: {unmodelled}</p> : <p className="hint">Modelled: it changes the fight.</p>}
      {!add.ok && rank < def.maxRank && <p className="hint">{add.reason}</p>}
      <div className="talent-card-buttons">
        <button type="button" aria-label={`Remove a point from ${def.name}`} onClick={() => onRemove(def.id)}>
          −
        </button>
        <button type="button" aria-label={`Add a point to ${def.name}`} onClick={() => onAdd(def.id)}>
          +
        </button>
      </div>
    </section>
  );
}

/** Import: a talent string or a WowSimsExporter export; Apply only when the build is valid. */
function TalentImport({ presets, onApply }: { presets: readonly Readonly<TalentPreset>[]; onApply(talents: string, message: string): void }) {
  const [text, setText] = useState('');
  const result = useMemo(() => readTalentImport(text), [text]);
  return (
    <section className="talent-io" aria-label="Import talents">
      <h4 className="talent-io-title">Import</h4>
      <p className="hint">
        Paste a talent string (e.g. from wowsims) or a WowSimsExporter export (/wse export): only the talents are applied.
      </p>
      <textarea
        className="gear-textarea"
        aria-label="Talent import"
        rows={3}
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {result && (
        <section className="gear-report" role="region" aria-label="Talent import report">
          {result.ok ? (
            <p>
              Valid build ({talentBuildName(result.talents, presets)}): {pointsText(treePoints(ranksOf(result.talents)))}.
            </p>
          ) : (
            <>
              <p className="gear-report-error">Not applied: this is not a valid talent build.</p>
              <ul className="gear-warnings">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      <button
        type="button"
        disabled={!result?.ok}
        onClick={(e) => {
          if (e.detail > 0) e.currentTarget.blur();
          if (!result?.ok) return;
          onApply(result.talents, `Imported: ${talentBuildName(result.talents, presets)} (${pointsText(treePoints(ranksOf(result.talents)))}).`);
          setText('');
        }}
      >
        Apply talents
      </button>
    </section>
  );
}

/** Export: the full-width talent string, with Copy (clipboard, or the text selected). */
function TalentExport({ talents }: { talents: string }) {
  const [copied, setCopiedFor] = useState<{ text: string; message: string } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(talents);
      setCopiedFor({ text: talents, message: 'Copied.' });
      return;
    } catch {
      // No clipboard API (insecure origin, old browser) or permission refused: select the text.
    }
    let ok = false;
    try {
      area.current?.focus();
      area.current?.select();
      ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
    } catch {
      ok = false;
    }
    setCopiedFor({ text: talents, message: ok ? 'Copied.' : 'The text is selected: press Ctrl+C (Cmd+C) to copy it.' });
  };
  return (
    <section className="talent-io" aria-label="Export talents">
      <h4 className="talent-io-title">Export</h4>
      <textarea ref={area} className="gear-textarea" aria-label="Talent string" rows={2} readOnly spellCheck={false} value={talents} />
      <button
        type="button"
        onClick={() => {
          void copy();
        }}
      >
        Copy talent string
      </button>
      {copied && copied.text === talents && <p role="status">{copied.message}</p>}
    </section>
  );
}
