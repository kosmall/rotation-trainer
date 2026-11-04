import { CombatTextForm } from '../../CombatTextSettings';
import { useTrainer } from '../../state/TrainerProvider';
import { SetupCard, SetupSectionFrame } from './SectionHead';

/** Interface, Combat text: the floating combat text settings (the Fight dock has the quick switch). */
export function CombatTextSection() {
  const { state, actions } = useTrainer();
  return (
    <SetupSectionFrame
      section="combat-text"
      title="Combat text"
      description="The floating numbers over the fight. They only show what happens: the fight is the same with them on or off."
    >
      <SetupCard title="Combat text settings" width="full">
        <CombatTextForm settings={state.hudSettings} onChange={actions.changeHudSettings} />
      </SetupCard>
    </SetupSectionFrame>
  );
}
