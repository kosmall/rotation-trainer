import { SetupSectionFrame } from './SectionHead';

/**
 * Scenarios: the designed empty state until the scenarios panel (scripts plan Task 5, stage R5)
 * lands; the scenario files work from the command line today.
 */
export function ScenariosSection() {
  return (
    <SetupSectionFrame
      section="scenarios"
      title="Scenarios"
      description="Saved setups with their scripts, to run and compare on the same seeds."
    >
      <div className="empty-state">
        <p>
          <strong>No scenarios saved.</strong> Save the current setup or import a file.
        </p>
        <p className="note">
          Saving, importing and comparing scenarios here arrives with the script editor, after this redesign. Today the scenario files
          run from the command line: <code>npm run scenario:run</code> and <code>npm run scenario:compare</code>.
        </p>
      </div>
    </SetupSectionFrame>
  );
}
