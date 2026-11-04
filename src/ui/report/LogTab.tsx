// Report → Log (UI redesign spec §5.3, §6, §10): the whole combat log in words, filtered by text
// and by kind (All, Damage, Casts, Auras, Mana), in a virtual list: a fixed row height, only the
// rows in view (plus a margin) are in the DOM, so a 1,000-event log stays light. An ARIA table
// with `aria-rowcount` / `aria-rowindex`, so a screen reader knows the full size.

import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatInt } from '../format';
import type { ReportModel } from './reportModel';
import { filterLog } from './reportViewModel';
import type { LogKind, LogRow } from './reportViewModel';

/** Row height in px (CSS `.log-row` matches it). */
export const LOG_ROW_PX = 28;
/** The list's height when it cannot be measured (jsdom; CSS sets the same max height). */
const DEFAULT_VIEW_PX = 480;
/** Rows kept above and below the view. */
const OVERSCAN = 8;

const KINDS: readonly { kind: LogKind | null; label: string }[] = [
  { kind: null, label: 'All' },
  { kind: 'damage', label: 'Damage' },
  { kind: 'cast', label: 'Casts' },
  { kind: 'aura', label: 'Auras' },
  { kind: 'mana', label: 'Mana' },
];

const timeText = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

export const LogTab = memo(function LogTab({ model }: { model: ReportModel }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<LogKind | null>(null);
  const rows = useMemo(() => filterLog(model.log, query, kind), [model.log, query, kind]);
  return (
    <div className="card">
      <div className="filters">
        <label className="sr-only" htmlFor="log-q">
          Filter the log
        </label>
        <input
          id="log-q"
          type="search"
          placeholder="Filter, e.g. Immolate…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="seg" role="group" aria-label="Event kinds">
          {KINDS.map((k) => (
            <button key={k.label} type="button" aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <LogList rows={rows} />
      <p className="note" aria-live="polite">
        Showing {formatInt(rows.length)} of {formatInt(model.log.length)} events.
      </p>
    </div>
  );
});

/** The virtual list of log rows. */
export const LogList = memo(function LogList({ rows }: { rows: readonly LogRow[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewPx, setViewPx] = useState(DEFAULT_VIEW_PX);
  useLayoutEffect(() => {
    const h = scrollRef.current?.clientHeight ?? 0;
    if (h > 0) setViewPx(h);
  }, []);
  // A new filter starts at the top.
  const [shownRows, setShownRows] = useState(rows);
  if (shownRows !== rows) {
    setShownRows(rows);
    setScrollTop(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }
  const first = Math.max(0, Math.floor(scrollTop / LOG_ROW_PX) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewPx) / LOG_ROW_PX) + OVERSCAN);
  const visible = rows.slice(first, last);
  return (
    <div className="logtbl" role="table" aria-label="Combat log" aria-rowcount={rows.length + 1}>
      <div role="rowgroup">
        <div role="row" aria-rowindex={1} className="log-row log-headrow">
          <span role="columnheader">Time</span>
          <span role="columnheader">Event</span>
          <span role="columnheader" className="n">
            Amount
          </span>
        </div>
      </div>
      <div className="log-scroll" ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        <div role="rowgroup" className="log-body" style={{ height: rows.length * LOG_ROW_PX }}>
          {rows.length === 0 && <p className="note log-empty">No event matches.</p>}
          {visible.map((r, k) => (
            <div
              key={r.index}
              role="row"
              aria-rowindex={first + k + 2}
              className={`log-row kind-${r.kind}`}
              style={{ transform: `translateY(${(first + k) * LOG_ROW_PX}px)` }}
            >
              <span role="cell" className="tnum">
                {timeText(r.atMs)}
              </span>
              <span role="cell">{r.text}</span>
              <span role="cell" className={r.crit ? 'n tnum crit' : 'n tnum'}>
                {r.amount === null ? '' : `${formatInt(r.amount)}${r.crit ? '!' : ''}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
