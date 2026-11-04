// Report → Compare (UI redesign spec §3.4, §5.3, §6): the paired comparison of scenarios arrives
// with the scenario UI (the rotation scripts plan's ComparePanel, after the redesign: the author's
// answer Q8). Until then, the designed empty state with the way to Scenarios.

import { routeHref } from '../shell/router';

export function CompareTab() {
  return (
    <div className="empty-state">
      <h2>Compare Two or More Scenarios</h2>
      <p>Save your current setup as a scenario, or import one, then run them on the same seeds to see which is really better.</p>
      <a className="btn primary" href={routeHref({ mode: 'setup', section: 'scenarios' })}>
        Open Scenarios
      </a>
    </div>
  );
}
