import { DistanceField, FightGroup } from '../../SetupPanel';
import { useTrainer } from '../../state/TrainerProvider';
import { SetupCard, SetupSectionFrame } from './SectionHead';

/** Fight settings: the fight length and the timed buffs (Heroism), the distance from the target. */
export function FightSettingsSection() {
  const { state, actions } = useTrainer();
  const group = { catalog: state.nextFight.catalog, config: state.config, onChange: actions.changeConfig };
  return (
    <SetupSectionFrame
      section="fight"
      title="Fight settings"
      description="How long the fight lasts, when Heroism comes and how far you stand from the target."
    >
      <div className="buff-groups">
        <SetupCard title="Fight">
          <FightGroup {...group} />
        </SetupCard>
        <SetupCard title="Distance">
          <DistanceField {...group} />
        </SetupCard>
      </div>
    </SetupSectionFrame>
  );
}
