import { TalentsEditor } from '../../TalentsPanel';
import { TALENT_PRESETS_OFFERED } from '../../state/selectors';
import { useTrainer } from '../../state/TrainerProvider';
import { SetupSectionFrame } from './SectionHead';

/** Talents: presets, the three trees (side by side from 1280 px), import and export. */
export function TalentsSection() {
  const { state, actions } = useTrainer();
  return (
    <SetupSectionFrame
      section="talents"
      title="Talents"
      description="Your build: the bot, the simulator and the fight use it. A change applies to the next fight."
    >
      <TalentsEditor talents={state.talents} presets={TALENT_PRESETS_OFFERED} onChange={actions.changeTalents} warnings={state.talentWarnings} />
    </SetupSectionFrame>
  );
}
