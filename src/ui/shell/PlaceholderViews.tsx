// Interim Setup and Report views (UI redesign Task 1): the routes, titles and headings exist, the
// sections arrive in Tasks 3 (Setup) and 4 (Report). Until then every panel is on the Fight
// screen's legacy layout. Loaded lazily, like the real views will be.

import { MODE_HREFS, SETUP_SECTION_TITLES } from './router';
import type { ReportTab, SetupSection } from './router';

export function SetupPlaceholder({ section }: { section: SetupSection }) {
  return (
    <section className="view placeholder" aria-labelledby="view-title">
      <h1 id="view-title">{SETUP_SECTION_TITLES[section]}</h1>
      <p>
        This section moves here with the new Setup screen. Until then, every setup panel is on the{' '}
        <a href={MODE_HREFS.fight}>Fight screen</a>.
      </p>
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
        {REPORT_TAB_TITLES[tab]} arrives with the new Report screen. Until then, the fight summary and the Simulator are on the{' '}
        <a href={MODE_HREFS.fight}>Fight screen</a>.
      </p>
    </section>
  );
}
