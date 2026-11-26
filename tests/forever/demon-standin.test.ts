import { describe, expect, it } from 'vitest';
import { loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { simulatePull } from '../../src/forever/fight';
import { runCell } from '../../src/forever/runner';
import { demonsAt } from '../../src/forever/stats';

describe('a demon before the build’s own one is learned', () => {
  it('is the Voidwalker from level 10, then the build’s demon', () => {
    const succ = loadVariant('DEMO_PACT_R1');
    expect(demonsAt(succ, 12)).toEqual({ pet: 'voidwalker', sacrificed: 'imp' });
    expect(demonsAt(succ, 20)).toEqual({ pet: 'succubus', sacrificed: 'imp' });
    const fel = loadVariant('HB_DEMO_FEL');
    expect(demonsAt(fel, 29).pet).toBe('voidwalker');
    expect(demonsAt(fel, 30).pet).toBe('felhunter');
  });

  it('is the Imp before level 10, and a demon that is not learned cannot be sacrificed', () => {
    expect(demonsAt({ pet: 'succubus', sacrificed: null }, 9).pet).toBe('imp');
    expect(demonsAt({ pet: 'imp', sacrificed: 'felhunter' }, 25).sacrificed).toBeNull();
    expect(demonsAt({ pet: null, sacrificed: null }, 25)).toEqual({ pet: null, sacrificed: null });
  });

  it('lets the builds with a late demon level normally (they died in almost every fight before)', () => {
    for (const [build, level] of [['DEMO_PACT_R1', 15], ['HB_DEMO_FEL', 20], ['HB_DEMO_FEL', 29], ['TF_DEMO_SUC_R1', 12]] as const) {
      const m = runCell({ variant: loadVariant(build), level, profile: 'average', params: loadParams(), mobs: 1 }, 20, 1).metrics;
      expect(m.killsPerHour, `${build} L${level}`).toBeGreaterThan(40);
      expect(m.deathsPerHour, `${build} L${level}`).toBeLessThan(5);
    }
  });

  it('the stand-in fights: the pet deals damage in the pull', () => {
    const r = simulatePull({ variant: loadVariant('DEMO_PACT_R1'), level: 15, profile: 'average', params: loadParams() }, 3);
    expect(r.petDamage).toBeGreaterThan(0);
  });
});
