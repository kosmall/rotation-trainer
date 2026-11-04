import { useState } from 'react';
import { DEFAULT_SETUP, normalizeSetup } from '../../../setup/defaults';
import { SETUP_PRESETS } from '../../../setup/presets';
import { BUFF_GROUPS, BuffGroup, enabledCount, groupOf, SetupPresetBar } from '../../SetupPanel';
import { useTrainer } from '../../state/TrainerProvider';
import { ConfirmDialog } from '../Modal';
import { SetupCard, SetupSectionFrame } from './SectionHead';

const GROUPS = ['raid', 'consumables', 'debuffs'] as const;

/**
 * Buffs & consumables: the setup presets and "Reset to Defaults…" (it asks first), then raid and
 * party buffs, consumables and target debuffs side by side.
 */
export function BuffsSection() {
  const { state, actions } = useTrainer();
  const { config, nextFight } = state;
  const catalog = nextFight.catalog;
  const [confirming, setConfirming] = useState(false);
  const group = { catalog, config, onChange: actions.changeConfig };
  return (
    <SetupSectionFrame
      section="buffs"
      title="Buffs & consumables"
      description="Raid and party buffs, consumables and the debuffs other players keep on the target."
    >
      <div className="sv-presets">
        <SetupPresetBar {...group} presets={SETUP_PRESETS} />
        <button type="button" className="btn" onClick={() => setConfirming(true)}>
          Reset to Defaults…
        </button>
      </div>
      <div className="buff-groups">
        {GROUPS.map((id) => {
          const def = BUFF_GROUPS.find((g) => g.id === id)!;
          const total = catalog.filter((b) => groupOf(b) === id).length;
          return (
            <SetupCard key={id} title={def.title} count={`${enabledCount(catalog, config, id)} of ${total} on`}>
              <BuffGroup {...group} group={id} />
            </SetupCard>
          );
        })}
      </div>
      {confirming && (
        <ConfirmDialog
          title="Reset to Defaults?"
          confirmLabel="Reset to Defaults"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            actions.changeConfig(normalizeSetup(DEFAULT_SETUP, catalog));
          }}
        >
          <p>
            This replaces the whole setup with the defaults: no buffs, consumables or item effects, the default rotation and its item
            rules, a {DEFAULT_SETUP.fightDurationSec}&nbsp;s fight at {DEFAULT_SETUP.distanceYd}&nbsp;yd, your gear (My gear) and your
            build (My build).
          </p>
        </ConfirmDialog>
      )}
    </SetupSectionFrame>
  );
}
