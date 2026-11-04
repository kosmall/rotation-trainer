// Report → Damage (UI redesign spec §5.3): "Damage by spell" (icon, name, share bar in the school's
// chart mark, damage, DPS, casts, crit, avg hit, avg crit, miss, a total row), "Buffs and items"
// (uptime, uses or procs, first at), "DPS over time" (5 s rolling, the fight's DPS so far, the
// bot's line with the same seed, buff lanes, legend, "Show data") and "What to look at".

import { memo, useMemo } from 'react';
import { LineChart } from '../charts/LineChart';
import type { LineSeries } from '../charts/LineChart';
import { formatDps, formatInt, secondsText } from '../format';
import { SpellIcon } from '../SpellIcon';
import { AlertIcon, CheckIcon } from './reportIcons';
import type { ReportModel } from './reportModel';
import type { NamedThing } from './reportView';

const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const intOrNa = (x: number | null) => (x === null ? 'n/a' : formatInt(x));

/** The icon of a table row (28 px; the school-coloured tile shows when the file is missing). */
export function RowIcon({ thing }: { thing: NamedThing }) {
  return (
    <span className={`row-icon school-${thing.school ?? 'none'}`} aria-hidden="true">
      {thing.icon && <SpellIcon icon={thing.icon} kind={thing.iconKind} className="row-icon-img" />}
    </span>
  );
}

export const DamageTab = memo(function DamageTab({ model }: { model: ReportModel }) {
  const { spells, totals, buffs, name, series, buffLanes, insights, durationMs } = model;
  const lines = useMemo<LineSeries[]>(() => {
    const out: LineSeries[] = [
      { id: 'rolling', label: 'DPS, 5 s rolling', values: series.rolling, variant: 'primary' },
      { id: 'so-far', label: 'Fight DPS so far', values: series.cumulative, variant: 'dashed' },
    ];
    if (series.bot !== null) out.push({ id: 'bot', label: 'Bot, same seed', values: series.bot, variant: 'muted' });
    return out;
  }, [series]);
  return (
    <div className="rep-grid">
      <div className="rep-col">
        <div className="card">
          <h2>
            Damage by spell <small>Last fight</small>
          </h2>
          <div className="tbl-wrap">
            <table className="dmg" aria-label="Damage by spell">
              <thead>
                <tr>
                  <th scope="col">Spell</th>
                  <th scope="col">Damage</th>
                  <th scope="col">DPS</th>
                  <th scope="col">Casts</th>
                  <th scope="col">Crit</th>
                  <th scope="col" className="opt">
                    Avg hit
                  </th>
                  <th scope="col" className="opt">
                    Avg crit
                  </th>
                  <th scope="col" className="opt">
                    Miss
                  </th>
                </tr>
              </thead>
              <tbody>
                {spells.map((r) => {
                  const thing = name(r.spellId);
                  return (
                    <tr key={r.spellId}>
                      <th scope="row" className="sp">
                        <div className="sp-cell">
                          <RowIcon thing={thing} />
                          <div>
                            {thing.name} <span className="share-pct">{pct(r.share)}</span>
                            <div className="share" aria-hidden="true">
                              <i className={`mark-${thing.school ?? 'none'}`} style={{ transform: `scaleX(${r.share})` }} />
                            </div>
                          </div>
                        </div>
                      </th>
                      <td className="n">{formatInt(r.damage)}</td>
                      <td className="n">{formatDps(r.dps)}</td>
                      <td className="n">{formatInt(r.casts)}</td>
                      <td className="n">{pct(r.critPct)}</td>
                      <td className="n opt" title={r.hits === 0 && r.ticks > 0 ? 'Per tick' : undefined}>
                        {intOrNa(r.avgHit)}
                      </td>
                      <td className="n opt">{intOrNa(r.avgCrit)}</td>
                      <td className="n opt">{formatInt(r.misses)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td className="n">{formatInt(totals.damage)}</td>
                  <td className="n">{formatDps(totals.dps)}</td>
                  <td className="n">{formatInt(totals.casts)}</td>
                  <td />
                  <td className="opt" />
                  <td className="opt" />
                  <td className="n opt">{formatInt(totals.misses)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="note">Avg hit of a DoT is its average tick. Crit is of the direct hits.</p>
        </div>
        <div className="card">
          <h2>
            Buffs and items <small>Uptime in this fight</small>
          </h2>
          {buffs.length === 0 ? (
            <p className="note">No buff or item effect was up in this fight.</p>
          ) : (
            <div className="tbl-wrap">
              <table className="dmg" aria-label="Buffs and items">
                <thead>
                  <tr>
                    <th scope="col">Aura</th>
                    <th scope="col">Uptime</th>
                    <th scope="col">Used or procs</th>
                    <th scope="col" className="opt">
                      First at
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {buffs.map((b) => {
                    const thing = name(b.auraId);
                    return (
                      <tr key={b.auraId}>
                        <th scope="row" className="sp">
                          <div className="sp-cell">
                            <RowIcon thing={thing} />
                            <div>{thing.name}</div>
                          </div>
                        </th>
                        <td className="n">{pct(b.uptime)}</td>
                        <td className="n">{formatInt(b.applications)}</td>
                        <td className="n opt">{secondsText(b.firstAtMs)} s</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div className="card">
        <h2>
          DPS over time <small>5 s rolling, with your buffs</small>
        </h2>
        <LineChart
          title="DPS over time"
          description={`Your DPS over the rolling 5 seconds, the fight's DPS so far${series.bot !== null ? ' and the bot with the same setup and seed' : ''}, per second; your buff windows above.`}
          x={series.x}
          xMax={durationMs / 1000}
          series={lines}
          lanes={buffLanes}
          format={formatDps}
          valueName="DPS"
        />
        <ul className="legend" aria-label="Legend">
          {lines.map((l) => (
            <li key={l.id}>
              <i className={`key key-${l.variant}`} aria-hidden="true" />
              {l.label}
            </li>
          ))}
        </ul>
        {insights.length > 0 ? (
          <>
            <h2 className="look-head">What to look at</h2>
            <ul className="insights" aria-label="What to look at">
              {insights.map((i) => (
                <li key={i.text}>
                  {i.kind === 'good' ? <CheckIcon /> : <AlertIcon />}
                  <span>{i.text}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="note">The bot could not replay this fight, so there is no comparison.</p>
        )}
      </div>
    </div>
  );
});
