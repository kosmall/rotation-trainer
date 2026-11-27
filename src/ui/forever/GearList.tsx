import { totalsOf, type GearItem, type ItemStats, type MyGear, type Slot } from '../../forever/web/gear';

const SLOT_NAMES: Record<Slot, string> = {
  head: 'Głowa', neck: 'Szyja', shoulder: 'Ramiona', back: 'Plecy', chest: 'Klatka', wrist: 'Nadgarstki', hands: 'Dłonie', waist: 'Pas', legs: 'Nogi', feet: 'Stopy',
  finger1: 'Pierścień 1', finger2: 'Pierścień 2', trinket1: 'Trinket 1', trinket2: 'Trinket 2', mainhand: 'Broń', offhand: 'Offhand', ranged: 'Dystansowa',
};

/** "Stamina 12, Cień +14": the non-zero stats. */
export function statLine(s: ItemStats): string {
  const parts: [string, number][] = [['Stamina', s.stamina], ['Intellect', s.intellect], ['Spirit', s.spirit], ['Armor', s.armor], ['Moc czarów', s.spellPower], ['Cień +', s.shadowSpellPower], ['Crit %', s.critPct], ['Hit %', s.hitPct]];
  const out = parts.filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`);
  return out.length > 0 ? out.join(', ') : '—';
}

function Row({ item }: { item: GearItem }) {
  return (
    <tr>
      <td>{SLOT_NAMES[item.slot]}</td>
      <td>{item.name ?? `#${item.id}`}</td>
      <td>
        {item.error ? <span className="fv-error">nie udało się pobrać: {item.error}</span> : statLine(item.stats)}
        {item.unmodelled.map((u) => (
          <div key={u} className="fv-note">
            nie modelowane: {u}
          </div>
        ))}
      </td>
    </tr>
  );
}

/** The imported items ("mój sprzęt"), their summed stats, and a button to forget them. */
export function GearList({ gear, onRemove }: { gear: MyGear; onRemove(): void }) {
  const t = totalsOf(gear);
  return (
    <>
      <h2>Moje itemy</h2>
      <table className="fv-table" aria-label="Moje itemy">
        <thead>
          <tr>
            <th>Slot</th>
            <th>Item</th>
            <th>Staty</th>
          </tr>
        </thead>
        <tbody>
          {gear.items.map((i) => (
            <Row key={`${i.slot}-${i.id}`} item={i} />
          ))}
        </tbody>
      </table>
      <p className="fv-note">
        Suma: {statLine(t)}. Crit zawiera 5% bazy profilu „przeciętny”. Enchanty i gemy nie są w eksporcie. Wybierz „mój sprzęt” w Opcjach zaawansowanych (Sprzęt).
      </p>
      <button type="button" className="btn" onClick={onRemove}>
        Usuń mój sprzęt
      </button>
    </>
  );
}
