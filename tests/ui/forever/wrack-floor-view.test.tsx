import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { loadVariant } from '../../../src/forever/builds';
import { loadParams } from '../../../src/forever/data/load';
import { BuildsView } from '../../../src/ui/forever/BuildsView';
import { RotationFlow } from '../../../src/ui/forever/RotationsView';

afterEach(cleanup);

describe('Wrack health floor in the build views', () => {
  for (const [id, pct] of [['DT_SS_WRACK_70', '70%'], ['DT_SS_WRACK_50', '50%']] as const) {
    it(`${id}: the filler fact, the Wrack step and the Drain Life step name the ${pct} floor`, () => {
      const { container } = render(<RotationFlow v={loadVariant(id)} params={loadParams()} />);
      const text = container.textContent ?? '';
      expect(text).toContain(`Wrack, gdy HP powyżej ${pct}; przy niższym HP Drain Life`);
      expect(container.querySelector('[data-step="filler_wrack"]')?.textContent).toContain(`HP powyżej ${pct}`);
      expect(container.querySelector('[data-step="filler_drain_life"]')?.textContent).toContain(`filler przy HP ${pct} i niższym`);
    });
  }
  it('the builds tab shows the floor too', () => {
    const { container } = render(<BuildsView level={50} ids={['DT_SS_WRACK_70']} id="DT_SS_WRACK_70" onIdChange={() => {}} />);
    expect(container.textContent).toContain('Wrack, gdy HP powyżej 70%; przy niższym HP Drain Life');
  });
  it('a Wrack build without a floor still reads just "Wrack"', () => {
    const { container } = render(<RotationFlow v={loadVariant('AFF_WRACK')} params={loadParams()} />);
    expect(container.textContent).not.toContain('HP powyżej 70%');
    expect(container.querySelector('[data-step="filler_drain_life"]')?.textContent).not.toContain('filler przy HP');
  });
});
