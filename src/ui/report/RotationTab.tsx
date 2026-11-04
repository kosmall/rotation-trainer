// Report → Rotation (UI redesign spec §3.4, §5.3): the priority list's rules in order, each with
// your casts (or item uses) against the bot's in the same fight (same setup and seed); then the
// spells you cast that no rule presses.

import { memo } from 'react';
import { formatInt } from '../format';
import { RowIcon } from './DamageTab';
import type { ReportModel } from './reportModel';
import type { RotationRow } from './reportViewModel';

function Row({ row, model }: { row: RotationRow; model: ReportModel }) {
  const diff = row.bot === null ? 0 : row.you - row.bot;
  return (
    <li>
      <RowIcon thing={model.name(row.spellId)} />
      <span className="prio-name">{row.rank === null ? model.name(row.spellId).name : row.label}</span>
      <span className="cmp">
        <span aria-label={`You: ${row.you}`}>{formatInt(row.you)}</span>
        <span aria-label={`Bot: ${row.bot ?? 'not known'}`} className={diff !== 0 ? 'cmp-diff' : undefined}>
          {row.bot === null ? '–' : formatInt(row.bot)}
        </span>
      </span>
    </li>
  );
}

export const RotationTab = memo(function RotationTab({ model }: { model: ReportModel }) {
  const { rotation, bot } = model;
  const ruled = rotation.filter((r) => r.rank !== null);
  const extra = rotation.filter((r) => r.rank === null);
  return (
    <div className="card">
      <h2>
        Your casts against the bot’s{' '}
        <small>{bot !== null ? 'Same setup and seed' : model.last.sim !== null ? 'A simulation’s fight is the bot’s own' : 'The bot could not replay this fight'}</small>
      </h2>
      <div className="prio-head" aria-hidden="true">
        <span />
        <span />
        <span>Rule</span>
        <span className="cmp">
          <span>You</span>
          <span>Bot</span>
        </span>
      </div>
      <ol className="prio" aria-label="Your casts against the bot’s">
        {ruled.map((r) => (
          <Row key={r.spellId} row={r} model={model} />
        ))}
      </ol>
      {extra.length > 0 && (
        <>
          <h3 className="prio-extra-head">Not in the priority list</h3>
          <ul className="prio prio-extra" aria-label="Not in the priority list">
            {extra.map((r) => (
              <Row key={r.spellId} row={r} model={model} />
            ))}
          </ul>
        </>
      )}
      <p className="note">
        Completed casts and item uses per rule, in priority order (a spell two rules press counts once, at its first rule). The bot
        presses the first castable rule every 10 ms.
      </p>
    </div>
  );
});
