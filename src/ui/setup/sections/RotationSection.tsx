import { useState } from 'react';
import type { BuffDef, SpecData } from '../../../data/types';
import type { ScriptRule } from '../../../script/types';
import type { SetupConfig } from '../../../setup/types';
import { RotationGroup } from '../../SetupPanel';
import { useTrainer } from '../../state/TrainerProvider';
import { ConfirmDialog } from '../Modal';
import { SetupCard, SetupSectionFrame } from './SectionHead';

type Mode = 'basic' | 'script';

/** "Cast Shadow Bolt", "Use Destruction Potion", "Wait" (names from the spec and the catalog). */
function ruleAction(rule: ScriptRule, spec: SpecData, catalog: readonly BuffDef[]): string {
  if (rule.action === 'wait') return 'Wait';
  const name =
    rule.action === 'cast'
      ? spec.spells.find((s) => s.id === rule.id)?.name
      : catalog.find((b) => b.id === rule.id || b.effect.action?.id === rule.id)?.name;
  return `${rule.action === 'cast' ? 'Cast' : 'Use'} ${name ?? rule.id ?? '?'}`;
}

/** The active script's rules, read only (the script editor comes with the scripts plan's Task 5, stage R5). */
function ScriptRules({ config, spec, catalog }: { config: SetupConfig; spec: SpecData; catalog: readonly BuffDef[] }) {
  const rules = config.script?.rules ?? [];
  if (rules.length === 0) {
    return (
      <div className="empty-state">
        <p>
          <strong>No rules yet.</strong> Add a rule or convert the basic rotation.
        </p>
        <p className="note">
          The script editor (Add Rule, Convert From Basic Rotation, Edit as JSON) arrives after this redesign. Until then a script
          comes with a scenario file (<code>npm run scenario:run</code>); the basic rotation plays.
        </p>
      </div>
    );
  }
  return (
    <ol className="rules" aria-label="Rotation rules">
      {rules.map((rule, i) => (
        <li key={i} className={rule.enabled === false ? 'rule off' : 'rule'}>
          <span className="act">{ruleAction(rule, spec, catalog)}</span>
          <code className={rule.if && rule.if.trim() !== '' ? 'cond' : 'cond always'}>
            {rule.if && rule.if.trim() !== '' ? rule.if : 'Always'}
          </code>
          {rule.enabled === false && <span className="note">Off</span>}
        </li>
      ))}
    </ol>
  );
}

/**
 * Rotation: the Basic / Script switch. Basic: preset, curse, DoTs, Life Tap and the item use
 * rules. Script: the active script's rules (read only until the script editor lands) and "Clear
 * Script…" (it asks first).
 */
export function RotationSection() {
  const { state, actions } = useTrainer();
  const { config, nextFight } = state;
  const scriptRules = config.script?.rules.length ?? 0;
  const [mode, setMode] = useState<Mode>(() =>
    scriptRules > 0 || (typeof window !== 'undefined' && window.location.hash.endsWith('/script')) ? 'script' : 'basic',
  );
  const [confirming, setConfirming] = useState(false);
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
        <span className="note">
          {scriptRules > 0 ? `A script with ${scriptRules} ${scriptRules === 1 ? 'rule' : 'rules'} plays.` : 'The basic rotation plays.'}
        </span>
      </div>
      {mode === 'basic' ? (
        <SetupCard title="Basic rotation" width="full">
          {scriptRules > 0 && <p className="note pending">A script is active: it plays instead of these settings until you clear it.</p>}
          <RotationGroup catalog={nextFight.catalog} config={config} onChange={actions.changeConfig} />
        </SetupCard>
      ) : (
        <SetupCard title="Script" count={scriptRules > 0 ? `${scriptRules} ${scriptRules === 1 ? 'rule' : 'rules'}` : undefined} width="full">
          {scriptRules > 0 && (
            <div className="script-tools">
              <span className="spacer" />
              <button type="button" className="btn small" onClick={() => setConfirming(true)}>
                Clear Script…
              </button>
            </div>
          )}
          <ScriptRules config={config} spec={nextFight.spec} catalog={nextFight.catalog} />
        </SetupCard>
      )}
      {confirming && (
        <ConfirmDialog
          title="Clear the Script?"
          confirmLabel="Clear Script"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            const { script: _script, ...rest } = config;
            actions.changeConfig(rest);
          }}
        >
          <p>
            This removes the script’s {scriptRules} {scriptRules === 1 ? 'rule' : 'rules'} and its named conditions; the basic rotation
            plays again.
          </p>
        </ConfirmDialog>
      )}
    </SetupSectionFrame>
  );
}
