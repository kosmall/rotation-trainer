// The Setup screen (UI redesign spec §5.1): the rail of sections, the active section, the next
// fight's summary. Loaded lazily by the shell; the route gives the section.

import type { SetupSection } from '../shell/router';
import { BuffsSection } from './sections/BuffsSection';
import { ClassOptionsSection } from './sections/ClassOptionsSection';
import { CombatTextSection } from './sections/CombatTextSection';
import { FightSettingsSection } from './sections/FightSettingsSection';
import { GearSection } from './sections/GearSection';
import { ItemsSection } from './sections/ItemsSection';
import { RotationSection } from './sections/RotationSection';
import { ScenariosSection } from './sections/ScenariosSection';
import { TalentsSection } from './sections/TalentsSection';
import { SetupRail } from './SetupRail';
import { SummaryAside } from './SummaryAside';
import './setup.css';

function Section({ section }: { section: SetupSection }) {
  switch (section) {
    case 'gear':
      return <GearSection />;
    case 'talents':
      return <TalentsSection />;
    case 'buffs':
      return <BuffsSection />;
    case 'items':
      return <ItemsSection />;
    case 'rotation':
      return <RotationSection />;
    case 'fight':
      return <FightSettingsSection />;
    case 'class':
      return <ClassOptionsSection />;
    case 'scenarios':
      return <ScenariosSection />;
    case 'combat-text':
      return <CombatTextSection />;
  }
}

/** Rail, section, summary. The sections read the trainer themselves (`useTrainer`). */
export function SetupView({ section }: { section: SetupSection }) {
  return (
    <div className="sv">
      <SetupRail active={section} />
      <div className="sv-main">
        <Section key={section} section={section} />
      </div>
      <SummaryAside />
    </div>
  );
}
