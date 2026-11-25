import { useMemo } from 'react';
import { collectVerify } from '../../forever/verify';

/** Every data point still flagged `verify: true`: the results are only as good as these. */
export function AssumptionsPanel() {
  const items = useMemo(() => collectVerify(), []);
  return (
    <>
      <p className="fv-note">
        {items.length} założeń czeka na weryfikację. Wyniki symulacji są tylko tak dokładne jak te dane (HP mobów, sprzęt, regeneracja, część talentów).
      </p>
      <div className="fv-scroll">
        <table className="fv-table" aria-label="Założenia do weryfikacji">
          <thead>
            <tr>
              <th scope="col">Plik</th>
              <th scope="col">Pozycja</th>
              <th scope="col">Źródło / uwaga</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a, i) => (
              <tr key={`${a.file}:${a.name}:${i}`}>
                <td>{a.file}</td>
                <th scope="row">{a.name}</th>
                <td>{a.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
