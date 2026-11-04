// Report → Timeline (UI redesign spec §5.3; fight timeline and key fights Task K3, spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 C): the overview on
// top (one lane per spell and buff, and the DPS over time), both with the cursor: a click picks a
// second, the band shows it; under them "Moment by moment" (MomentByMoment.tsx), driven by the same
// cursor. A new fight starts at second 0.

import { memo, useMemo, useState } from 'react';
import { Lanes } from '../charts/Lanes';
import { LineChart } from '../charts/LineChart';
import type { LineSeries } from '../charts/LineChart';
import { formatDps } from '../format';
import { createCursorStore, MomentByMoment, useCursor } from './MomentByMoment';
import type { CursorStore } from './MomentByMoment';
import type { ReportModel } from './reportModel';

export const TimelineTab = memo(function TimelineTab({ model }: { model: ReportModel }) {
  // One cursor per fight (React's "information from previous renders": no effect).
  const [cursor, setCursor] = useState(() => ({ model, store: createCursorStore(model.seconds.length) }));
  let store = cursor.store;
  if (cursor.model !== model) {
    store = createCursorStore(model.seconds.length);
    setCursor({ model, store });
  }
  return (
    <div className="timeline">
      <Overview model={model} store={store} />
      <MomentByMoment model={model} store={store} />
    </div>
  );
});

function Overview({ model, store }: { model: ReportModel; store: CursorStore }) {
  const second = useCursor(store);
  const { series, durationMs } = model;
  const bucket = model.seconds[second];
  const lines = useMemo<LineSeries[]>(() => {
    const out: LineSeries[] = [
      { id: 'rolling', label: 'DPS, 5 s rolling', values: series.rolling, variant: 'primary' },
      { id: 'so-far', label: 'Fight DPS so far', values: series.cumulative, variant: 'dashed' },
    ];
    if (series.bot !== null) out.push({ id: 'bot', label: 'Bot, same seed', values: series.bot, variant: 'muted' });
    return out;
  }, [series]);
  const cursorMs = useMemo(() => (bucket === undefined ? null : ([bucket.startMs, bucket.endMs] as const)), [bucket]);
  const cursorSec = useMemo(() => (cursorMs === null ? null : ([cursorMs[0] / 1000, cursorMs[1] / 1000] as const)), [cursorMs]);
  const pickMs = store.set;
  const onPickMs = useMemo(() => (ms: number) => pickMs(Math.min(Math.floor(ms / 1000), model.seconds.length - 1)), [pickMs, model.seconds.length]);
  const onPick = useMemo(() => (t: number) => onPickMs(t * 1000), [onPickMs]);
  return (
    <div className="rep-grid timeline-overview">
      <div className="card">
        <h2>
          Casts and auras over the fight <small>One lane per spell and buff; click to pick a second</small>
        </h2>
        {model.timeline.length === 0 ? (
          <p className="note">Nothing was cast in this fight.</p>
        ) : (
          <Lanes
            title="Casts and auras over the fight"
            description="Each spell's casts (a damage over time spell as the time it was up on the target) and each of your buffs, over the fight. The band marks the second shown below."
            rows={model.timeline}
            durationMs={durationMs}
            cursorMs={cursorMs}
            onPickMs={onPickMs}
          />
        )}
      </div>
      <div className="card">
        <h2>
          DPS over time <small>Click to pick a second</small>
        </h2>
        <LineChart
          title="DPS over time"
          description={`Your DPS over the rolling 5 seconds and the fight's DPS so far${series.bot !== null ? ', and the bot with the same setup and seed' : ''}, per second; the band marks the second shown below.`}
          x={series.x}
          xMax={durationMs / 1000}
          series={lines}
          format={formatDps}
          valueName="DPS"
          height={220}
          cursor={cursorSec}
          onPick={onPick}
        />
        <ul className="legend" aria-label="Legend">
          {lines.map((l) => (
            <li key={l.id}>
              <i className={`key key-${l.variant}`} aria-hidden="true" />
              {l.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
