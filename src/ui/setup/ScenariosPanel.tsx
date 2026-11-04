// Setup → Scenarios (rotation scripts Task 5, spec §2 B; UI redesign spec §3.4, §6): the scenario
// library. Save the current setup as a scenario (its script, or the basic rotation converted, and
// optionally the setup), Apply (asks first and names what it replaces), Export (copy the JSON or
// download the file), Import (paste or pick a file: the validation report; errors block, warnings
// do not; a preview before saving), Duplicate, Rename, Delete, and the bundled examples
// (docs/scenarios, loaded lazily). The library is the trainer's (`state.scenarios`): saved under
// its own key; a storage that refuses it gets a message, the library then lives until a reload.
// Scenario files are untrusted: src/scenarios/format.ts reads them (size and shape limits, never
// throws); this panel shows only text.

import { useEffect, useId, useMemo, useState } from 'react';
import type { ItemDb } from '../../data/items/types';
import { applyScenario, exportScenario, parseScenario, parseScenarioValue, readScenario } from '../../scenarios/format';
import { addScenario, deleteScenario, duplicateScenario, renameScenario, type LibraryResult, type ScenarioEntry } from '../../scenarios/library';
import { SCENARIO_FORMAT, SCENARIO_LIMITS, SCENARIO_VERSION, type Scenario, type ScenarioIssue, type ScenarioParse } from '../../scenarios/types';
import { convertToScript } from '../../script/convert';
import { scriptIsActive } from '../../script/normalize';
import { gearNeedsDb } from '../../setup/gear';
import type { SetupConfig } from '../../setup/types';
import { useTrainer } from '../state/TrainerProvider';
import { ConfirmDialog, Modal } from './Modal';
import { SetupCard } from './sections/SectionHead';

type Examples = (typeof import('../../scenarios/examples'))['exampleScenarios'];

/** The bundled examples' module, loaded once on first use (about 25 kB of JSON: its own chunk). */
let examplesModule: Promise<{ exampleScenarios: Examples }> | null = null;
function loadExamples(): Promise<{ exampleScenarios: Examples }> {
  examplesModule ??= import('../../scenarios/examples');
  return examplesModule;
}

/** A file larger than this many bytes is not read at all (4 bytes per character at most, UTF-8). */
const MAX_FILE_BYTES = SCENARIO_LIMITS.fileChars * 4;

const SETUP_PART_NAMES: Readonly<Record<string, string>> = {
  talents: 'talents',
  gear: 'gear',
  gearPresetId: 'gear',
  enabledBuffs: 'buffs and items',
  timed: 'Heroism timing',
  distanceYd: 'distance',
  fightDurationSec: 'fight length',
  warlock: 'class options',
  rotation: 'basic rotation settings',
};

/** "gear, talents and fight length" (the scenario's setup parts, in words). */
export function setupParts(scenario: Scenario): string[] {
  const parts = Object.keys(scenario.setup ?? {}).map((k) => SETUP_PART_NAMES[k] ?? k);
  return [...new Set(parts)];
}

export function listText(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The current setup as a scenario: its script (or the basic rotation converted) and, optionally, its setup. */
export function scenarioOfSetup(
  config: SetupConfig,
  basic: Parameters<typeof convertToScript>[1],
  { name, description, includeSetup }: { name: string; description: string; includeSetup: boolean },
): Scenario {
  const script = scriptIsActive(config.script) ? structuredClone(config.script) : convertToScript(config, basic);
  const value: Record<string, unknown> = { format: SCENARIO_FORMAT, version: SCENARIO_VERSION, name: name.trim() };
  if (description.trim() !== '') value.description = description.trim();
  if (includeSetup) {
    const { gear, gearPresetId, talents, enabledBuffs, timed, distanceYd, fightDurationSec, warlock, rotation } = config;
    value.setup = structuredClone({ gear, gearPresetId, talents, enabledBuffs, timed, distanceYd, fightDurationSec, warlock, rotation });
  }
  value.script = script;
  const read = readScenario(JSON.parse(JSON.stringify(value)));
  return read.scenario ?? (value as unknown as Scenario);
}

function IssuesReport({ parse, title }: { parse: Pick<ScenarioParse, 'errors' | 'warnings'>; title: string }) {
  const line = (i: ScenarioIssue) => `${i.path === '' ? 'file' : i.path}: ${i.message}${i.suggestion !== undefined ? ` Did you mean “${i.suggestion}”?` : ''}`;
  return (
    <div className="sc-report" role="group" aria-label={title}>
      {parse.errors.length > 0 && (
        <>
          <h3>
            {parse.errors.length} {parse.errors.length === 1 ? 'error' : 'errors'} (they block saving)
          </h3>
          <ul className="se-issues">
            {parse.errors.slice(0, 50).map((e, i) => (
              <li key={i} className="err">
                {line(e)}
              </li>
            ))}
          </ul>
        </>
      )}
      {parse.warnings.length > 0 && (
        <>
          <h3>
            {parse.warnings.length} {parse.warnings.length === 1 ? 'warning' : 'warnings'}
          </h3>
          <ul className="se-issues">
            {parse.warnings.slice(0, 50).map((w, i) => (
              <li key={i} className="warn">
                {line(w)}
              </li>
            ))}
          </ul>
        </>
      )}
      {parse.errors.length === 0 && parse.warnings.length === 0 && <p className="note">No errors or warnings.</p>}
    </div>
  );
}

function ScenarioSummary({ scenario }: { scenario: Scenario }) {
  const parts = setupParts(scenario);
  const n = scenario.script.rules.length;
  const defs = Object.keys(scenario.script.defs ?? {}).length;
  return (
    <p className="note sc-meta">
      {n} {n === 1 ? 'rule' : 'rules'}
      {defs > 0 && `, ${defs} named ${defs === 1 ? 'condition' : 'conditions'}`}
      {parts.length > 0 ? `; with its ${listText(parts)}` : '; rotation only'}
      {scenario.updatedAt !== undefined && `; updated ${scenario.updatedAt.slice(0, 10)}`}
    </p>
  );
}

/** Save the current setup as a scenario: name, description, include the setup. */
function SaveDialog({ onSave, onClose, scriptActive }: { onSave(v: { name: string; description: string; includeSetup: boolean }): void; onClose(): void; scriptActive: boolean }) {
  const id = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [includeSetup, setIncludeSetup] = useState(true);
  const blank = name.trim() === '';
  return (
    <Modal title="Save Current as Scenario" onClose={onClose} className="sc-dialog">
      <form
        className="sc-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!blank) onSave({ name, description, includeSetup });
        }}
      >
        <label htmlFor={`${id}-name`}>Name</label>
        <input id={`${id}-name`} type="text" value={name} maxLength={SCENARIO_LIMITS.name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <label htmlFor={`${id}-desc`}>Description</label>
        <textarea id={`${id}-desc`} rows={3} value={description} maxLength={SCENARIO_LIMITS.description} onChange={(e) => setDescription(e.target.value)} />
        <label className="sc-check">
          <input type="checkbox" checked={includeSetup} onChange={(e) => setIncludeSetup(e.target.checked)} />
          Include the setup (gear, talents, buffs, fight settings, class options)
        </label>
        <p className="note">
          {scriptActive ? 'The scenario keeps the current script.' : 'No script is active: the scenario keeps the basic rotation, converted to a script.'}
        </p>
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={blank}>
            Save Scenario
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RenameDialog({ entry, onRename, onClose }: { entry: ScenarioEntry; onRename(name: string): void; onClose(): void }) {
  const id = useId();
  const [name, setName] = useState(entry.scenario.name);
  return (
    <Modal title={`Rename “${entry.scenario.name}”`} onClose={onClose} className="sc-dialog">
      <form
        className="sc-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() !== '') onRename(name);
        }}
      >
        <label htmlFor={`${id}-name`}>New name</label>
        <input id={`${id}-name`} type="text" value={name} maxLength={SCENARIO_LIMITS.name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={name.trim() === ''}>
            Rename
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Apply: what it replaces, the setup checkbox, and how the scenario reads against this setup. */
function ApplyDialog({
  scenario,
  config,
  db,
  onApply,
  onClose,
}: {
  scenario: Scenario;
  config: SetupConfig;
  db: ItemDb | null;
  onApply(includeSetup: boolean): void;
  onClose(): void;
}) {
  const parts = setupParts(scenario);
  const [includeSetup, setIncludeSetup] = useState(parts.length > 0);
  const check = useMemo(() => parseScenarioValue(scenario, { base: config, db }), [scenario, config, db]);
  const replaced = ['your rotation (the script, or the basic rotation)', ...(includeSetup ? [`your ${listText(parts)}`] : [])];
  return (
    <ConfirmDialog title={`Apply “${scenario.name}”?`} confirmLabel="Apply Scenario" onCancel={onClose} onConfirm={() => onApply(includeSetup)}>
      <p>This replaces {listText(replaced)}. It plays from the next fight.</p>
      {parts.length > 0 && (
        <label className="sc-check">
          <input type="checkbox" checked={includeSetup} onChange={(e) => setIncludeSetup(e.target.checked)} />
          Also apply its setup ({listText(parts)})
        </label>
      )}
      {(check.errors.length > 0 || check.warnings.length > 0) && <IssuesReport parse={check} title="Check against this setup" />}
    </ConfirmDialog>
  );
}

/** Export: the JSON, Copy JSON and Download File. */
function ExportDialog({ scenario, onClose }: { scenario: Scenario; onClose(): void }) {
  const text = useMemo(() => exportScenario(scenario), [scenario]);
  const [message, setMessage] = useState('');
  const fileName = `${scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'scenario'}.json`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Copied.');
    } catch {
      setMessage('The clipboard is not available: select the text and press Ctrl+C (Cmd+C).');
    }
  };
  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage(`Downloading ${fileName}.`);
    } catch {
      setMessage('The download could not start: copy the text instead.');
    }
  };
  return (
    <Modal title={`Export “${scenario.name}”`} onClose={onClose} className="sc-dialog sc-wide">
      <p className="note">A scenario file: share it, keep it, or give it to an AI agent with docs/scenario-format.md.</p>
      <textarea className="sc-json" aria-label="Scenario JSON" rows={14} readOnly value={text} spellCheck={false} />
      <div className="script-tools">
        <button type="button" className="btn small primary" onClick={() => void copy()}>
          Copy JSON
        </button>
        <button type="button" className="btn small" onClick={download}>
          Download File
        </button>
      </div>
      <p className="note" aria-live="polite">
        {message}
      </p>
    </Modal>
  );
}

/** Import: paste or pick a file; the validation report; the preview; Save to Library. */
function ImportDialog({ config, db, dbStatus, onSave, onClose }: { config: SetupConfig; db: ItemDb | null; dbStatus: string; onSave(s: Scenario): void; onClose(): void }) {
  const id = useId();
  const [text, setText] = useState('');
  const [fileNote, setFileNote] = useState('');
  const parse = useMemo(() => (text.trim() === '' ? null : parseScenario(text, { base: config, db })), [text, config, db]);
  const needsDb = parse?.scenario?.setup?.gear !== undefined && gearNeedsDb(parse.scenario.setup.gear) && db === null;
  const readFile = async (file: File | undefined) => {
    if (file === undefined) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileNote(`The file is too large (a scenario is at most ${SCENARIO_LIMITS.fileChars.toLocaleString('en-US')} characters).`);
      return;
    }
    setFileNote('Reading file…');
    try {
      const content = await file.text();
      setText(content);
      setFileNote(`Read ${file.name}.`);
    } catch {
      setFileNote('The file could not be read.');
    }
  };
  return (
    <Modal title="Import a Scenario" onClose={onClose} className="sc-dialog sc-wide">
      <div className="sc-form">
        <label htmlFor={`${id}-text`}>Scenario JSON</label>
        <textarea
          id={`${id}-text`}
          className="sc-json"
          rows={10}
          spellCheck={false}
          autoComplete="off"
          placeholder="Paste a scenario file here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <label htmlFor={`${id}-file`}>Or choose a file</label>
        <input id={`${id}-file`} type="file" accept=".json,application/json" onChange={(e) => void readFile(e.target.files?.[0])} />
        {fileNote !== '' && (
          <p className="note" role="status">
            {fileNote}
          </p>
        )}
      </div>
      {parse !== null && (
        <>
          {parse.scenario !== undefined && (
            <div className="sc-preview" role="group" aria-label="Preview">
              <h3>{parse.scenario.name}</h3>
              {parse.scenario.description !== undefined && <p>{parse.scenario.description}</p>}
              <ScenarioSummary scenario={parse.scenario} />
            </div>
          )}
          <IssuesReport parse={parse} title="Validation report" />
          {needsDb && <p className="note">{dbStatus === 'error' ? 'The item database could not load: its gear ids are not checked.' : 'Loading the item database to check the gear ids…'}</p>}
        </>
      )}
      <div className="confirm-actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={parse === null || !parse.ok || parse.scenario === undefined} onClick={() => parse?.scenario && onSave(parse.scenario)}>
          Save to Library
        </button>
      </div>
    </Modal>
  );
}

type Dialog =
  | { kind: 'save' }
  | { kind: 'import' }
  | { kind: 'apply'; scenario: Scenario }
  | { kind: 'export'; scenario: Scenario }
  | { kind: 'rename'; entry: ScenarioEntry }
  | { kind: 'delete'; entry: ScenarioEntry };

/** The Scenarios section's body (see the file comment). */
export function ScenariosPanel() {
  const { state, actions } = useTrainer();
  const { config, nextFight, scenarios, itemDb } = state;
  const entries = scenarios.entries;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [examples, setExamples] = useState<{ file: string; scenario: Scenario }[] | null>(null);
  const [examplesFailed, setExamplesFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadExamples().then(
      (m) => live && setExamples(m.exampleScenarios()),
      () => live && setExamplesFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  // Importing checks gear ids against the item database: load it when the dialog opens.
  const importing = dialog?.kind === 'import';
  const { requestDb } = actions;
  useEffect(() => {
    if (importing) requestDb();
  }, [importing, requestDb]);

  const now = () => new Date().toISOString();
  const commit = (r: LibraryResult, done: string) => {
    if (!r.ok) {
      setMessage({ text: `Not done: ${r.error}.`, error: true });
      return false;
    }
    const saved = actions.changeScenarios(r.list);
    setMessage(saved ? { text: done, error: false } : { text: `${done} Not saved: the browser’s storage is full or blocked.`, error: true });
    return true;
  };
  const apply = (scenario: Scenario, includeSetup: boolean) => {
    actions.changeConfig(applyScenario(config, scenario, { includeSetup, db: itemDb.db }));
    // A scenario's gear may need the item database: the trainer loads it (the next fight waits for it).
    setMessage({ text: `Applied “${scenario.name}”: it plays from the next fight.`, error: false });
  };

  return (
    <>
      <div className="script-tools sc-tools">
        <button type="button" className="btn primary" disabled={!scenarios.loaded} onClick={() => setDialog({ kind: 'save' })}>
          Save Current as Scenario…
        </button>
        <button type="button" className="btn" disabled={!scenarios.loaded} onClick={() => setDialog({ kind: 'import' })}>
          Import Scenario…
        </button>
      </div>
      {scenarios.saved === 'failed' && (
        <p className="setup-warn" role="alert">
          Not saved: the browser’s storage is full or blocked. The library is kept until you reload the page; export the scenarios you
          want to keep.
        </p>
      )}
      {message !== null && (
        <p className={message.error ? 'setup-warn' : 'note sc-done'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      <SetupCard title="Library" count={`${entries.length} of 100`} width="full">
        {!scenarios.loaded ? (
          <p className="note">Loading the library…</p>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <p>
              <strong>No scenarios saved.</strong> Save the current setup or import a file.
            </p>
            <p className="note">
              A scenario is a script (and optionally a setup) in a JSON file: save one to compare it in Report → Compare, or ask an AI
              agent to write one (docs/scenario-format.md).
            </p>
          </div>
        ) : (
          <ul className="sc-list" aria-label="Saved scenarios">
            {entries.map((entry) => {
              const s = entry.scenario;
              return (
                <li key={entry.id} className="sc-item">
                  <div className="sc-text">
                    <h3>{s.name}</h3>
                    {s.description !== undefined && <p className="sc-desc">{s.description}</p>}
                    <ScenarioSummary scenario={s} />
                  </div>
                  <div className="sc-actions">
                    <button type="button" className="btn small primary" aria-label={`Apply ${s.name}…`} onClick={() => setDialog({ kind: 'apply', scenario: s })}>
                      Apply…
                    </button>
                    <button type="button" className="btn small" aria-label={`Export ${s.name}…`} onClick={() => setDialog({ kind: 'export', scenario: s })}>
                      Export…
                    </button>
                    <button type="button" className="btn small quiet" aria-label={`Duplicate ${s.name}`} onClick={() => commit(duplicateScenario(entries, entry.id, now()), `Duplicated “${s.name}”.`)}>
                      Duplicate
                    </button>
                    <button type="button" className="btn small quiet" aria-label={`Rename ${s.name}…`} onClick={() => setDialog({ kind: 'rename', entry })}>
                      Rename…
                    </button>
                    <button type="button" className="btn small quiet" aria-label={`Delete ${s.name}…`} onClick={() => setDialog({ kind: 'delete', entry })}>
                      Delete…
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SetupCard>
      <SetupCard title="Examples" count={examples === null ? undefined : `${examples.length}`} width="full">
        <p className="note">The example files of docs/scenarios: apply one, or save it to the library to compare it.</p>
        {examples === null ? (
          <p className="note">{examplesFailed ? 'The examples could not load: reload the page.' : 'Loading the examples…'}</p>
        ) : (
          <ul className="sc-list" aria-label="Example scenarios">
            {examples.map(({ file, scenario: s }) => (
              <li key={file} className="sc-item">
                <div className="sc-text">
                  <h3>{s.name}</h3>
                  {s.description !== undefined && <p className="sc-desc">{s.description}</p>}
                  <ScenarioSummary scenario={s} />
                </div>
                <div className="sc-actions">
                  <button type="button" className="btn small" aria-label={`Save to Library ${s.name}`} onClick={() => commit(addScenario(entries, s, now()), `Saved “${s.name}” to the library.`)}>
                    Save to Library
                  </button>
                  <button type="button" className="btn small quiet" aria-label={`Apply ${s.name}…`} onClick={() => setDialog({ kind: 'apply', scenario: s })}>
                    Apply…
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SetupCard>
      {dialog?.kind === 'save' && (
        <SaveDialog
          scriptActive={scriptIsActive(config.script)}
          onClose={() => setDialog(null)}
          onSave={(v) => {
            const scenario = scenarioOfSetup(config, nextFight.basic, v);
            if (commit(addScenario(entries, scenario, now()), `Saved “${scenario.name}” to the library.`)) setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'import' && (
        <ImportDialog
          config={config}
          db={itemDb.db}
          dbStatus={itemDb.status}
          onClose={() => setDialog(null)}
          onSave={(s) => {
            if (commit(addScenario(entries, s, now()), `Imported “${s.name}”.`)) setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'apply' && (
        <ApplyDialog
          scenario={dialog.scenario}
          config={config}
          db={itemDb.db}
          onClose={() => setDialog(null)}
          onApply={(includeSetup) => {
            setDialog(null);
            apply(dialog.scenario, includeSetup);
          }}
        />
      )}
      {dialog?.kind === 'export' && <ExportDialog scenario={dialog.scenario} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'rename' && (
        <RenameDialog
          entry={dialog.entry}
          onClose={() => setDialog(null)}
          onRename={(name) => {
            if (commit(renameScenario(entries, dialog.entry.id, name, now()), `Renamed to “${name.trim()}”.`)) setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete “${dialog.entry.scenario.name}”?`}
          confirmLabel="Delete Scenario"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            const name = dialog.entry.scenario.name;
            setDialog(null);
            commit(deleteScenario(entries, dialog.entry.id), `Deleted “${name}”.`);
          }}
        >
          <p>This removes it from the library. Export it first to keep a copy.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
