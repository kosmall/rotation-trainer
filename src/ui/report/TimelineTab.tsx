// Report → Timeline (UI redesign spec §5.3): one lane per spell (casts; a DoT as its uptime) and
// per buff (its windows), on one time axis.

import { memo } from 'react';
import { Lanes } from '../charts/Lanes';
import type { ReportModel } from './reportModel';

export const TimelineTab = memo(function TimelineTab({ model }: { model: ReportModel }) {
  return (
    <div className="card">
      <h2>
        Casts and auras over the fight <small>One lane per spell and buff</small>
      </h2>
      {model.timeline.length === 0 ? (
        <p className="note">Nothing was cast in this fight.</p>
      ) : (
        <Lanes
          title="Casts and auras over the fight"
          description="Each spell's casts (a damage over time spell as the time it was up on the target) and each of your buffs, over the fight."
          rows={model.timeline}
          durationMs={model.durationMs}
        />
      )}
    </div>
  );
});
