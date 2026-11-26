import { describe, expect, it } from 'vitest';
import { loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { simulatePull } from '../../src/forever/fight';
import { runCell } from '../../src/forever/runner';
import { demonsAt } from '../../src/forever/stats';

/** A demonology build whose demon comes late. */
const FELHUNTER = { ...loadVariant('DEMO_PACT_R1'), id: 'FEL_TEST', pet: 'felhunter' as const, sacrificed: null };

describe('a demon before the build’s own one is learned', () => {
  it('is the Voidwalker from level 10, then the build’s demon', () => {
    const succ = loadVariant('DEMO_PACT_R1');
    expect(demonsAt(succ, 12)).toEqual({ pet: 'voidwalker', sacrificed: 'imp' });
    expect(demonsAt(succ, 20)).toEqual({ pet: 'succubus', sacrificed: 'imp' });
    const fel = FELHUNTER;
    expect(demonsAt(fel, 29).pet).toBe('voidwalker');
    expect(demonsAt(fel, 30).pet).toBe('felhunter');
  });

  it('is the Imp before level 10, and a demon that is not learned cannot be sacrificed', () => {
    expect(demonsAt({ pet: 'succubus', sacrificed: null }, 9).pet).toBe('imp');
    expect(demonsAt({ pet: 'imp', sacrificed: 'felhunter' }, 25).sacrificed).toBeNull();
    expect(demonsAt({ pet: null, sacrificed: null }, 25)).toEqual({ pet: null, sacrificed: null });
  });

  it('lets the builds with a late demon level normally (they died in almost every fight before)', () => {
    for (const [variant, level] of [[loadVariant('DEMO_PACT_R1'), 15], [FELHUNTER, 20], [FELHUNTER, 29], [loadVariant('DEMO_PACT_R2'), 12]] as const) {
      const build = variant.id;
      const m = runCell({ variant, level, profile: 'average', params: loadParams(), mobs: 1 }, 20, 1).metrics;
      expect(m.killsPerHour, `${build} L${level}`).toBeGreaterThan(40);
      expect(m.deathsPerHour, `${build} L${level}`).toBeLessThan(5);
    }
  });

  it('the stand-in fights: the pet deals damage in the pull', () => {
    const r = simulatePull({ variant: loadVariant('DEMO_PACT_R1'), level: 15, profile: 'average', params: loadParams() }, 3);
    expect(r.petDamage).toBeGreaterThan(0);
  });
});
