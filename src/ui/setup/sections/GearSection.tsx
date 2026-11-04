import { useEffect } from 'react';
import { setupGear } from '../../../setup/gear';
import { GearEditor, GearIoActions } from '../../GearPanel';
import { GEAR_PRESETS_OFFERED } from '../../state/selectors';
import { useTrainer } from '../../state/TrainerProvider';
import { SetupSectionFrame } from './SectionHead';

/** Gear: the character pane (`GearEditor`); Import and Export as dialogs. Opening it loads the item database. */
export function GearSection() {
  const { state, actions } = useTrainer();
  const { requestDb } = actions;
  useEffect(() => {
    requestDb();
  }, [requestDb]);
  const gear = setupGear(state.config);
  const db = state.itemDb.db;
  return (
    <SetupSectionFrame
      section="gear"
      title="Gear"
      description="17 slots from your WowSimsExporter export. A change applies to the next fight."
      actions={db !== null ? <GearIoActions gear={gear} db={db} onApply={(g) => actions.changeGear(g)} /> : undefined}
    >
      <GearEditor
        gear={gear}
        presets={GEAR_PRESETS_OFFERED}
        db={db}
        status={state.itemDb.status}
        onChange={actions.changeGear}
        onReload={actions.reload}
        hints={state.gearHints}
      />
    </SetupSectionFrame>
  );
}
