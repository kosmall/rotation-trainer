// Report → Timeline → "Moment by moment" (fight timeline and key fights Task K3; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 C, D, §3): the
// cursor's controls (a scrubber: arrows ±1 s, Shift ±5 s, Home/End; previous/next; "Go to"), the
// jumps to the next or previous aura change, item use, crit or queue drop, the panel of second N
// (everything from the log: damage per spell, casts, the queue, item uses, mana gains, aura
// changes, the auras up at its start, the bot's same second), the copy buttons, and the virtual
// list of all seconds with its filters. The cursor lives in a small store (`CursorStore`): the
// list and its rows subscribe to it, so a step of the cursor re-renders only the two rows whose
// highlight changes, never the list or its filters (spec §3, render budget).

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { formatDps, formatInt } from '../format';
import { SpellIcon } from '../SpellIcon';
import { countRender } from '../renderCount';
import { RowIcon } from './DamageTab';
import type { ReportModel } from './reportModel';
import { eventJumps, filterSeconds, jumpFrom, secondBuckets, secondsCsv, secondText, stateAt } from './secondsModel';
import type { ActiveAura, JumpKind, SecondBucket, SecondFilterKind } from './secondsModel';

// ---------------------------------------------------------------------------
// The cursor
// ---------------------------------------------------------------------------

/** The selected second, shared by the Timeline's charts, the panel and the list (subscribable). */
export interface CursorStore {
  get(): number;
  /** Moves the cursor to `second`, clamped to the fight's seconds (an integer). */
  set(second: number): void;
  subscribe(listener: () => void): () => void;
}

/** A cursor over `count` seconds, at second 0. */
export function createCursorStore(count: number): CursorStore {
  let value = 0;
  const listeners = new Set<() => void>();
  const max = Math.max(0, count - 1);
  return {
    get: () => value,
    set(second) {
      const next = Number.isFinite(second) ? Math.min(max, Math.max(0, Math.floor(second))) : value;
      if (next === value) return;
      value = next;
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The cursor's second (re-renders on every move). */
export function useCursor(store: CursorStore): number {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

const sec1 = (ms: number) => (ms / 1000).toFixed(1);
const sec2 = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

// ---------------------------------------------------------------------------
// Moment by moment
// ---------------------------------------------------------------------------

const JUMPS: readonly { kind: JumpKind; label: string }[] = [
  { kind: 'aura', label: 'aura change' },
  { kind: 'item', label: 'item use' },
  { kind: 'crit', label: 'crit' },
  { kind: 'queueDrop', label: 'queue drop' },
];

/**
 * The second-by-second explorer of one fight (`model.seconds`); `store` is the cursor the
 * Timeline's lanes and DPS chart share.
 */
export function MomentByMoment({ model, store }: { model: ReportModel; store: CursorStore }) {
  const second = useCursor(store);
  const { seconds } = model;
  if (seconds.length === 0) {
    return (
      <div className="card">
        <h2>Moment by moment</h2>
        <p className="note">This fight has no seconds to show.</p>
      </div>
    );
  }
  const bucket = seconds[Math.min(second, seconds.length - 1)]!;
  return (
    <div className="mbm">
      <div className="card mbm-main">
        <h2>
          Moment by moment <small>Second by second, from the fight’s log</small>
        </h2>
        <CursorControls model={model} store={store} second={bucket.second} />
        <SecondPanel model={model} bucket={bucket} />
      </div>
      <AllSeconds model={model} store={store} />
    </div>
  );
}

function CursorControls({ model, store, second }: { model: ReportModel; store: CursorStore; second: number }) {
  const last = model.seconds.length - 1;
  const jumps = useMemo(() => eventJumps(model.seconds), [model.seconds]);
  const [goText, setGoText] = useState('');
  const [goError, setGoError] = useState(false);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const step = e.shiftKey ? 5 : 1;
    const to: Record<string, number> = {
      ArrowRight: second + step,
      ArrowUp: second + step,
      ArrowLeft: second - step,
      ArrowDown: second - step,
      PageUp: second + 10,
      PageDown: second - 10,
      Home: 0,
      End: last,
    };
    const next = to[e.key];
    if (next === undefined) return;
    e.preventDefault();
    store.set(next);
  };
  const go = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = Number(goText.trim().replace(',', '.'));
    if (goText.trim() === '' || !Number.isFinite(v)) {
      setGoError(true);
      return;
    }
    setGoError(false);
    store.set(v);
  };
  return (
    <div className="mbm-controls">
      <div className="mbm-scrub">
        <button type="button" className="btn small" aria-label="Previous second" disabled={second <= 0} onClick={() => store.set(second - 1)}>
          ‹
        </button>
        <input
          type="range"
          aria-label="Second"
          min={0}
          max={last}
          step={1}
          value={second}
          aria-valuetext={`Second ${second} of ${last}`}
          onChange={(e) => store.set(Number(e.target.value))}
          onKeyDown={onKey}
        />
        <button type="button" className="btn small" aria-label="Next second" disabled={second >= last} onClick={() => store.set(second + 1)}>
          ›
        </button>
        <form className="mbm-go" onSubmit={go}>
          <label htmlFor="mbm-go">Go to (s)</label>
          <input
            id="mbm-go"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder="12.4"
            value={goText}
            aria-invalid={goError || undefined}
            aria-describedby={goError ? 'mbm-go-error' : undefined}
            onChange={(e) => setGoText(e.target.value)}
          />
          <button type="submit" className="btn small">
            Go
          </button>
          {goError && (
            <p id="mbm-go-error" className="note mbm-go-error" role="status">
              Type a time in seconds, e.g. 12.4.
            </p>
          )}
        </form>
      </div>
      <div className="mbm-jumps" role="group" aria-label="Jump to">
        {JUMPS.map(({ kind, label }) => {
          const prev = jumpFrom(jumps[kind], second, -1);
          const next = jumpFrom(jumps[kind], second, 1);
          return (
            <span key={kind} className="mbm-jump">
              <button type="button" aria-label={`Previous ${label}`} disabled={prev === null} onClick={() => prev !== null && store.set(prev)}>
                ‹
              </button>
              <span aria-hidden="true">{label[0]!.toUpperCase() + label.slice(1)}</span>
              <button type="button" aria-label={`Next ${label}`} disabled={next === null} onClick={() => next !== null && store.set(next)}>
                ›
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The panel of one second
// ---------------------------------------------------------------------------

function spellNotes(s: SecondBucket['spells'][number]): string {
  const parts: string[] = [];
  if (s.hits > 0) parts.push(`${s.hits} ${s.hits === 1 ? 'hit' : 'hits'}`);
  if (s.crits > 0) parts.push(`${s.crits} crit`);
  if (s.misses > 0) parts.push(`${s.misses} ${s.misses === 1 ? 'miss' : 'misses'}`);
  if (s.ticks > 0) parts.push(`${s.ticks} ${s.ticks === 1 ? 'tick' : 'ticks'}`);
  return parts.join(', ');
}

/** What the bot did in the same second, in words. */
function botText(b: SecondBucket, name: (id: string) => string): string {
  const casts = b.casts.filter((c) => c.kind === 'complete').map((c) => name(c.spellId));
  const items = b.items.map((i) => name(i.spellId));
  const did = [...casts, ...items.map((i) => `used ${i}`)];
  return `Bot: ${did.length > 0 ? did.join(', ') : 'nothing completed'}; ${formatInt(b.damage)} damage`;
}

function AuraList({ label, auras, model }: { label: string; auras: readonly ActiveAura[]; model: ReportModel }) {
  return (
    <div className="sec-state">
      <h4>{label}</h4>
      <ul aria-label={`${label} at the start`} className="sec-list">
        {auras.map((a) => (
          <li key={a.auraId}>
            <RowIcon thing={model.name(a.auraId)} />
            <span>{model.name(a.auraId).name}</span>
            <span className="tnum dim">{a.untilEnd ? `${sec1(a.remainingMs)} s (to the end)` : `${sec1(a.remainingMs)} s left`}</span>
          </li>
        ))}
      </ul>
      {auras.length === 0 && <p className="note">None.</p>}
    </div>
  );
}

const SecondPanel = memo(function SecondPanel({ model, bucket: b }: { model: ReportModel; bucket: SecondBucket }) {
  const name = useCallback((id: string) => model.name(id).name, [model]);
  const state = useMemo(() => stateAt(model.last.log, b.startMs, model.durationMs, model.ids), [model, b.startMs]);
  const botSeconds = useMemo(() => (model.bot === null ? null : secondBuckets(model.bot.log, model.durationMs, model.ids)), [model]);
  const bot = botSeconds?.[b.second] ?? null;
  return (
    <section className="sec-panel" role="region" aria-label="This second">
      <h3 aria-live="polite">
        Second {b.second}{' '}
        <small>
          {sec1(b.startMs)}–{sec1(b.endMs)} s{b.prePull > 0 ? `, with ${b.prePull} pre-pull ${b.prePull === 1 ? 'event' : 'events'}` : ''}
        </small>
      </h3>
      <dl className="sec-kpis">
        <div>
          <dt>Damage</dt>
          <dd aria-label="Damage in this second" className="tnum">
            {formatInt(b.damage)}
          </dd>
        </div>
        <div>
          <dt>DPS so far</dt>
          <dd aria-label="DPS so far" className="tnum">
            {formatDps(b.cumulativeDps)}
          </dd>
        </div>
        <div>
          <dt>Crits</dt>
          <dd aria-label="Crits" className="tnum">
            {formatInt(b.crits)}
          </dd>
        </div>
        <div>
          <dt>Mana gained</dt>
          <dd aria-label="Mana gained" className="tnum">
            +{formatInt(b.manaGained)}
          </dd>
        </div>
      </dl>
      {bot !== null && <p className="sec-bot">{botText(bot, name)}</p>}
      <div className="sec-grid">
        <div>
          {b.spells.length > 0 ? (
            <div className="tbl-wrap">
              <table className="dmg" aria-label="Damage in this second, per spell">
                <thead>
                  <tr>
                    <th scope="col">Spell</th>
                    <th scope="col">Damage</th>
                    <th scope="col">Hits</th>
                  </tr>
                </thead>
                <tbody>
                  {b.spells.map((s) => {
                    const thing = model.name(s.spellId);
                    return (
                      <tr key={s.spellId}>
                        <th scope="row" className="sp">
                          <div className="sp-cell">
                            <RowIcon thing={thing} />
                            <div>{thing.name}</div>
                          </div>
                        </th>
                        <td className="n">{formatInt(s.damage)}</td>
                        <td className="wrap">{spellNotes(s)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="note">No damage in this second.</p>
          )}
          <SecondEvents b={b} name={name} />
        </div>
        <div>
          <AuraList label="Your buffs" auras={state.self} model={model} />
          <AuraList label="On the target" auras={state.target} model={model} />
        </div>
      </div>
      <p className="note">
        Mana gains come from the log (Life Tap, potions, regeneration); the mana at the end of a second is not in the log, nor are
        stacks: auras show as up, refreshed and down.
      </p>
      <CopyButtons model={model} bucket={b} />
    </section>
  );
});

function SecondEvents({ b, name }: { b: SecondBucket; name: (id: string) => string }) {
  return (
    <div className="sec-events">
      {b.casts.length > 0 && (
        <>
          <h4>Casts</h4>
          <ul aria-label="Casts" className="sec-list">
            {b.casts.map((c, i) => (
              <li key={i}>
                <span className="tnum dim">{sec2(c.atMs)}</span>
                <span>
                  {name(c.spellId)}{' '}
                  {c.kind === 'start' ? 'started' : c.kind === 'complete' ? 'cast' : 'cancelled'}
                  {c.castMs !== null && c.castMs > 0 ? ` (${sec1(c.castMs)} s cast)` : c.kind === 'complete' && c.castMs === 0 ? ' (instant)' : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {b.queue.length > 0 && (
        <>
          <h4>Queue</h4>
          <ul aria-label="Queue" className="sec-list">
            {b.queue.map((q, i) => (
              <li key={i} className={q.dropped ? 'drop' : undefined}>
                <span className="tnum dim">{sec2(q.atMs)}</span>
                <span>
                  {name(q.spellId)} {q.dropped ? `dropped${q.reason ? ` (${q.reason})` : ''}` : 'queued'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {b.items.length > 0 && (
        <>
          <h4>Items used</h4>
          <ul aria-label="Items used" className="sec-list">
            {b.items.map((it, i) => (
              <li key={i}>
                <span className="tnum dim">{sec2(it.atMs)}</span>
                <span>{name(it.spellId)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {b.mana.length > 0 && (
        <>
          <h4>Mana</h4>
          <ul aria-label="Mana gains" className="sec-list">
            {b.mana.map((m, i) => (
              <li key={i}>
                <span className="tnum dim">{sec2(m.atMs)}</span>
                <span>
                  +{formatInt(m.amount)}
                  {m.spellId !== null ? ` from ${name(m.spellId)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {b.auras.length > 0 && (
        <>
          <h4>Auras</h4>
          <ul aria-label="Aura changes" className="sec-list">
            {b.auras.map((a, i) => (
              <li key={i} className={`aura-${a.change}`}>
                <span className="tnum dim">{sec2(a.atMs)}</span>
                <span>
                  <span aria-hidden="true">{a.change === 'up' ? '↑ ' : a.change === 'refresh' ? '↻ ' : '↓ '}</span>
                  {name(a.auraId)} {a.change === 'up' ? 'up' : a.change === 'refresh' ? 'refreshed' : 'down'}
                  {a.side === 'target' ? ' (target)' : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {b.ticks.length > 0 && (
        <p className="note">
          {b.ticks.length} damage over time {b.ticks.length === 1 ? 'tick' : 'ticks'}: {[...new Set(b.ticks.map((t) => name(t.auraId)))].join(', ')}.
        </p>
      )}
    </div>
  );
}

function CopyButtons({ model, bucket }: { model: ReportModel; bucket: SecondBucket }) {
  const [status, setStatus] = useState<{ text: string; manual: string | null } | null>(null);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ text: 'Copied.', manual: null });
    } catch {
      setStatus({ text: 'The text is selected below: press Ctrl+C (Cmd+C) to copy it.', manual: text });
    }
  };
  const name = (id: string) => model.name(id).name;
  return (
    <div className="sec-copy">
      <button type="button" className="btn small quiet" onClick={() => void copy(secondText(bucket, name))}>
        Copy This Second
      </button>
      <button type="button" className="btn small quiet" onClick={() => void copy(secondsCsv(model.seconds, name))}>
        Copy Fight Log (CSV)
      </button>
      {status !== null && (
        <p className="note" aria-live="polite">
          {status.text}
        </p>
      )}
      {status?.manual != null && (
        <textarea
          className="rep-copy"
          aria-label="Copied text"
          rows={6}
          readOnly
          value={status.manual}
          ref={(el) => {
            el?.select();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// All seconds: filters and the virtual list
// ---------------------------------------------------------------------------

/** Row height in px (CSS `.sec-row` matches it). */
export const SEC_ROW_PX = 36;
const DEFAULT_VIEW_PX = 480;
const OVERSCAN = 8;

const FILTERS: readonly { kind: SecondFilterKind; label: string }[] = [
  { kind: 'damage', label: 'Damage' },
  { kind: 'auras', label: 'Auras' },
  { kind: 'items', label: 'Items' },
  { kind: 'drops', label: 'Drops' },
];

const AllSeconds = memo(function AllSeconds({ model, store }: { model: ReportModel; store: CursorStore }) {
  countRender('SecondsFilter');
  const [kinds, setKinds] = useState<readonly SecondFilterKind[]>([]);
  const [query, setQuery] = useState('');
  const name = useCallback((id: string) => model.name(id).name, [model]);
  const rows = useMemo(() => filterSeconds(model.seconds, { kinds, query }, name), [model.seconds, kinds, query, name]);
  const toggle = (k: SecondFilterKind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));
  return (
    <div className="card mbm-all">
      <h2>
        All seconds <small>Click a second to see it</small>
      </h2>
      <div className="filters">
        <label className="sr-only" htmlFor="sec-q">
          Find a spell or aura
        </label>
        <input
          id="sec-q"
          type="search"
          placeholder="Find, e.g. Heroism…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="seg" role="group" aria-label="Show seconds with">
          {FILTERS.map((f) => (
            <button key={f.kind} type="button" aria-pressed={kinds.includes(f.kind)} onClick={() => toggle(f.kind)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <SecondsList rows={rows} model={model} store={store} />
      <p className="note" aria-live="polite">
        Showing {formatInt(rows.length)} of {formatInt(model.seconds.length)} seconds{kinds.length > 0 || query.trim() !== '' ? ' (filtered)' : ''}.
      </p>
    </div>
  );
});

const SecondsList = memo(function SecondsList({ rows, model, store }: { rows: readonly SecondBucket[]; model: ReportModel; store: CursorStore }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewPx, setViewPx] = useState(DEFAULT_VIEW_PX);
  useLayoutEffect(() => {
    const h = scrollRef.current?.clientHeight ?? 0;
    if (h > 0) setViewPx(h);
  }, []);
  const [shownRows, setShownRows] = useState(rows);
  if (shownRows !== rows) {
    setShownRows(rows);
    setScrollTop(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }
  // The list follows the cursor: a second out of view scrolls into the middle (no re-render here:
  // the scroll event re-renders the list as any scroll does).
  useEffect(
    () =>
      store.subscribe(() => {
        const el = scrollRef.current;
        if (el === null) return;
        const i = rows.findIndex((r) => r.second === store.get());
        if (i < 0) return;
        const top = i * SEC_ROW_PX;
        const view = el.clientHeight || DEFAULT_VIEW_PX;
        if (top < el.scrollTop || top + SEC_ROW_PX > el.scrollTop + view) el.scrollTop = Math.max(0, top - view / 2);
      }),
    [rows, store],
  );
  const pick = useCallback((second: number) => store.set(second), [store]);
  const iconsOf = useMemo(() => {
    const skip = new Set([...model.ids.hidden, ...model.ids.targets]);
    return (b: SecondBucket) => Object.keys(b.auraUpMs).filter((id) => !skip.has(id));
  }, [model.ids]);
  const first = Math.max(0, Math.floor(scrollTop / SEC_ROW_PX) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewPx) / SEC_ROW_PX) + OVERSCAN);
  return (
    <div className="sectbl" role="table" aria-label="All seconds" aria-rowcount={rows.length + 1}>
      <div role="rowgroup">
        <div role="row" aria-rowindex={1} className="sec-row sec-headrow">
          <span role="columnheader">Second</span>
          <span role="columnheader" className="n">
            DPS so far
          </span>
          <span role="columnheader" className="n">
            Damage
          </span>
          <span role="columnheader">Top spell</span>
          <span role="columnheader" className="opt">
            Buffs
          </span>
        </div>
      </div>
      <div className="sec-scroll" ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        <div role="rowgroup" className="sec-body" style={{ height: rows.length * SEC_ROW_PX }}>
          {rows.length === 0 && <p className="note log-empty">No second matches.</p>}
          {rows.slice(first, last).map((b, k) => (
            <SecondRow key={b.second} bucket={b} index={first + k} model={model} store={store} onPick={pick} buffs={iconsOf(b)} />
          ))}
        </div>
      </div>
    </div>
  );
});

interface SecondRowProps {
  bucket: SecondBucket;
  index: number;
  model: ReportModel;
  store: CursorStore;
  onPick(second: number): void;
  buffs: readonly string[];
}

const sameRow = (a: SecondRowProps, b: SecondRowProps) =>
  a.bucket === b.bucket && a.index === b.index && a.model === b.model && a.store === b.store && a.onPick === b.onPick && a.buffs.join() === b.buffs.join();

const SecondRow = memo(function SecondRow({ bucket: b, index, model, store, onPick, buffs }: SecondRowProps) {
  countRender('SecondRow');
  const active = useSyncExternalStore(
    store.subscribe,
    () => store.get() === b.second,
    () => store.get() === b.second,
  );
  const top = b.topSpellId === null ? null : model.name(b.topSpellId);
  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      className={active ? 'sec-row on' : 'sec-row'}
      style={{ transform: `translateY(${index * SEC_ROW_PX}px)` }}
      onClick={() => onPick(b.second)}
    >
      <span role="cell">
        <button type="button" className="sec-pick" aria-current={active ? 'true' : undefined} onClick={(e) => (e.stopPropagation(), onPick(b.second))}>
          {b.second} s
        </button>
      </span>
      <span role="cell" className="n tnum">
        {formatDps(b.cumulativeDps)}
      </span>
      <span role="cell" className="n tnum">
        {formatInt(b.damage)}
      </span>
      <span role="cell" className="sec-top">
        {top === null ? '–' : top.name}
      </span>
      <span role="cell" className="opt sec-buffs" title={buffs.map((id) => model.name(id).name).join(', ')}>
        <span className="sr-only">{buffs.map((id) => model.name(id).name).join(', ')}</span>
        {buffs.slice(0, 6).map((id) => {
          const n = model.name(id);
          return (
            <span key={id} className="sec-buff" aria-hidden="true">
              {n.icon !== null && <SpellIcon icon={n.icon} kind={n.iconKind} className="sec-buff-img" />}
            </span>
          );
        })}
      </span>
    </div>
  );
}, sameRow);
