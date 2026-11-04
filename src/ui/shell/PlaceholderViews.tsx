// Interim Setup and Report views (UI redesign Tasks 1-2): the routes, titles and headings exist, the
// sections arrive in Tasks 3 (Setup) and 4 (Report). Until then the interim Setup view shows the
// legacy setup panels (the Fight screen is the new arena since Task 2). Loaded lazily, like the
// real views will be.

import { LegacySetupPanels } from '../GameView';
import { MODE_HREFS, SETUP_SECTION_TITLES } from './router';
import type { ReportTab, SetupSection } from './router';

export function SetupPlaceholder({ section }: { section: SetupSection }) {
  return (
    <section className="view placeholder" aria-labelledby="view-title">
      <h1 id="view-title">{SETUP_SECTION_TITLES[section]}</h1>
      <p>
        This section gets its own page with the new Setup screen. Until then, every setup panel is below; the{' '}
        <a href={MODE_HREFS.fight}>Fight screen</a> plays the next fight.
      </p>
      <div className="legacy-setup">
        <LegacySetupPanels />
      </div>
    </section>
  );
}

const REPORT_TAB_TITLES: Readonly<Record<ReportTab, string>> = {
  damage: 'Damage',
  timeline: 'Timeline',
  log: 'Log',
  rotation: 'Rotation',
  simulator: 'Simulator',
  compare: 'Compare',
};

export function ReportPlaceholder({ tab }: { tab: ReportTab }) {
  return (
    <section className="view placeholder" aria-labelledby="view-title">
      <h1 id="view-title">Fight report</h1>
      <p>
        {REPORT_TAB_TITLES[tab]} arrives with the new Report screen. Until then, the fight summary is on the{' '}
        <a href={MODE_HREFS.fight}>Fight screen</a> and the Simulator on the <a href={MODE_HREFS.setup}>Setup screen</a>.
      </p>
    </section>
  );
}
