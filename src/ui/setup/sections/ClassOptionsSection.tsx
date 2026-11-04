import { useTrainer } from '../../state/TrainerProvider';
import { classOptionsOf } from './classOptions';
import { SetupCard, SetupSectionFrame } from './SectionHead';

/** "<Class> options": the class's own options (`classOptionsOf`), or a note when the class has none. */
export function ClassOptionsSection() {
  const { state, actions, meta } = useTrainer();
  const options = classOptionsOf(meta.spec.classId);
  const title = `${meta.spec.className} options`;
  return (
    <SetupSectionFrame section="class" title={title} description={`What only a ${meta.spec.className} chooses: armor, pets and the like.`}>
      {options ? (
        <SetupCard title={title} width="full">
          <options.Group catalog={state.nextFight.catalog} config={state.config} onChange={actions.changeConfig} />
        </SetupCard>
      ) : (
        <p className="note">This class has no options of its own.</p>
      )}
    </SetupSectionFrame>
  );
}
