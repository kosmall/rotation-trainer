import { lazy, Suspense, useMemo, useState } from 'react';
import type { SpecData } from '../../../data/types';
import { convertToScript } from '../../../script/convert';
import type { Script } from '../../../script/types';
import type { SetupConfig } from '../../../setup/types';
import { RotationGroup } from '../../SetupPanel';
import { useTrainer } from '../../state/TrainerProvider';
import { ConfirmDialog } from '../Modal';
import { SetupCard, SetupSectionFrame } from './SectionHead';

// The script editor is its own chunk (UI redesign spec §10: "Script editor osobno").
const ScriptEditor = lazy(() => import('../ScriptEditor'));

type Mode = 'basic' | 'script';

/**
 * The priority the next fight plays (the basic rotation's or the script's, compiled), in order:
 * the step's name and its condition in words (spec §3.4: the legacy "Priority" panel).
 */
function PriorityList({ priority }: { priority: SpecData['priority'] }) {
  return (
    <ol className="priority-list" aria-label="Priority">
      {priority.map((step) => (
        <li key={step.key ?? step.spellId}>
          <strong>{step.label}</strong>
          <span className="note">{step.hint}</span>
        </li>
      ))}
    </ol>
  );
}

/** The config with `script` (or without it when undefined). */
function withScript(config: SetupConfig, script: Script | undefined): SetupConfig {
  const { script: _old, ...rest } = config;
  return script === undefined ? rest : { ...rest, script };
}

/**
 * Rotation: the Basic / Script switch. Basic: preset, curse, DoTs, Life Tap and the item use
 * rules (kept as they are; while a script has rules they only wait). Script: the script editor
 * (rotation scripts Task 5) with Convert From Basic Rotation (asks before it replaces a script)
 * and Clear Script (asks first). Under both: the priority the next fight plays.
 */
export function RotationSection() {
  const { state, actions, meta } = useTrainer();
  const { config, nextFight } = state;
  const scriptRules = config.script?.rules.length ?? 0;
  const [mode, setMode] = useState<Mode>(() =>
    scriptRules > 0 || (typeof window !== 'undefined' && window.location.hash.endsWith('/script')) ? 'script' : 'basic',
  );
  const [confirming, setConfirming] = useState<'clear' | 'convert' | null>(null);
  const convert = () => actions.changeConfig(withScript(config, convertToScript(config, nextFight.basic)));
  // Fires per rule from the last simulation, when it ran exactly this setup.
  const last = meta.lastSimulation;
  const fires = useMemo(() => {
    if (last === null || last.result.ruleFires === undefined || JSON.stringify(last.config) !== JSON.stringify(config)) return null;
    return Object.fromEntries(Object.entries(last.result.ruleFires).map(([k, v]) => [k, v.meanFires]));
  }, [last, config]);
  const rulesText = (n: number) => `${n} ${n === 1 ? 'rule' : 'rules'}`;
  return (
    <SetupSectionFrame
      section="rotation"
      title="Rotation"
      description="The bot, the simulator and the “Next” hint play this rotation: the first step whose condition holds and whose spell is ready wins."
    >
      <div className="field-row">
        <span className="lab" aria-hidden="true">
          Mode
        </span>
        <div className="seg" role="group" aria-label="Rotation mode">
          {(['basic', 'script'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === 'basic' ? 'Basic' : 'Script'}
            </button>
          ))}
        </div>
        <span className={scriptRules > 0 ? 'note script-active' : 'note'}>
          {scriptRules > 0 ? `Script active: its ${rulesText(scriptRules)} play.` : 'The basic rotation plays.'}
        </span>
      </div>
      {mode === 'basic' ? (
        <SetupCard title="Basic rotation" width="full">
          {scriptRules > 0 && (
            <p className="note pending">
              A script is active: it plays instead of these settings until you clear it (Script → Clear Script…).
            </p>
          )}
          <div className={scriptRules > 0 ? 'basic-waiting' : undefined}>
            <RotationGroup catalog={nextFight.catalog} config={config} onChange={actions.changeConfig} />
          </div>
        </SetupCard>
      ) : (
        <SetupCard title="Script" count={scriptRules > 0 ? rulesText(scriptRules) : undefined} width="full">
          <Suspense fallback={<p className="note">Loading the script editor…</p>}>
            <ScriptEditor
              script={config.script}
              onChange={(script) => actions.changeConfig(withScript(config, script))}
              context={nextFight.script.context}
              spells={nextFight.spec.spells}
              auras={nextFight.spec.auras}
              catalog={nextFight.catalog}
              fires={fires}
              onConvert={() => (scriptRules > 0 ? setConfirming('convert') : convert())}
              onClear={() => setConfirming('clear')}
            />
          </Suspense>
        </SetupCard>
      )}
      <div className="sv-priority">
        <SetupCard title="Priority of the next fight" count={`${nextFight.spec.priority.length} steps`} width="full">
          <PriorityList priority={nextFight.spec.priority} />
        </SetupCard>
      </div>
      {confirming === 'clear' && (
        <ConfirmDialog
          title="Clear the Script?"
          confirmLabel="Clear Script"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            actions.changeConfig(withScript(config, undefined));
          }}
        >
          <p>
            This removes the script’s {rulesText(scriptRules)} and its named conditions; the basic rotation plays again.
          </p>
        </ConfirmDialog>
      )}
      {confirming === 'convert' && (
        <ConfirmDialog
          title="Replace the Script?"
          confirmLabel="Convert"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            convert();
          }}
        >
          <p>
            Converting the basic rotation replaces the script’s {rulesText(scriptRules)} and its named conditions with the basic
            rotation’s rules (the same fights, rule for rule).
          </p>
        </ConfirmDialog>
      )}
    </SetupSectionFrame>
  );
}
