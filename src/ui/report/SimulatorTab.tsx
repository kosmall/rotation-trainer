// Report → Simulator (UI redesign spec §3.4, §5.3, Q6): the Simulator panel's body in the Report's
// layout: the run bar, the mean card, the histogram (the mean, and "You" when the last fight was
// played with the setup the result simulated), then the per-spell, item, uptime and mana numbers.
// Works without a fight. The run itself lives in ReportView (`useSimulatorRun`).

import { memo } from 'react';
import type { SetupConfig } from '../../setup/types';
import { Histogram } from '../charts/Histogram';
import { formatDps } from '../format';
import { histogramSummary, PlusMinusNote, SimulationResult, SimulatorForm } from '../SimulatorPanel';
import type { SimulatorRun } from '../SimulatorPanel';
import { ordinal, shareBelow } from './reportView';

export interface YourFight {
  dps: number;
  /** The ended fight's config: the marker shows only on a result of the same setup. */
  config: SetupConfig;
}

export const SimulatorTab = memo(function SimulatorTab({ sim, you }: { sim: SimulatorRun; you: YourFight | null }) {
  const outcome = sim.outcome;
  let mark: number | null = null;
  let note: string | null = null;
  if (outcome !== null && you !== null) {
    if (JSON.stringify(outcome.config) === JSON.stringify(you.config)) {
      mark = you.dps;
      const p = Math.min(99, Math.max(1, Math.round(shareBelow(outcome.result.histogram, you.dps) * 100)));
      note = `Your fight (${formatDps(you.dps)}) sits at about the ${ordinal(p)} percentile of the bot’s fights with this setup.`;
    } else {
      note = 'Your last fight was played with another setup, so it is not marked here.';
    }
  }
  return (
    <div className="sim-tab">
      <SimulatorForm sim={sim} layout="bar" />
      {outcome !== null && (
        <SimulationResult
          result={outcome.result}
          label={outcome.label}
          copy={sim.copy}
          setCopy={sim.setCopy}
          onReuseSeed={sim.reuseSeed}
          layout="report"
          histogram={
            <Histogram
              counts={outcome.result.histogram.counts}
              binStart={outcome.result.histogram.binStart}
              binWidth={outcome.result.histogram.binWidth}
              mean={outcome.result.meanDps}
              you={mark}
              description={histogramSummary(outcome.result)}
            />
          }
          histogramNote={note}
          histogramCaption={mark !== null ? 'Your last fight marked' : undefined}
        />
      )}
      {outcome === null && sim.running === null && (
        <div className="empty-state">
          <h2>The Spread of DPS</h2>
          <p>Run the simulator to see the spread of DPS for the next fight’s setup, played by the bot.</p>
        </div>
      )}
      <PlusMinusNote />
    </div>
  );
});
