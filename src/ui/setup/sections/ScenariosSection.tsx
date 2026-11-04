import { ScenariosPanel } from '../ScenariosPanel';
import { SetupSectionFrame } from './SectionHead';

/** Scenarios (Setup → Library): the scenario library, import and export, and the examples. */
export function ScenariosSection() {
  return (
    <SetupSectionFrame
      section="scenarios"
      title="Scenarios"
      description="Saved scripts, with or without their setup: apply one, export it to a file, import one an AI agent wrote, and compare them in Report → Compare on the same seeds."
    >
      <ScenariosPanel />
    </SetupSectionFrame>
  );
}
