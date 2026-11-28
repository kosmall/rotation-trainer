// A3-019: Agonizing Flames' keys say what they are: the Searing Pain bonus is a crit chance, not crit damage.
import { describe, expect, it } from 'vitest';
import { effectNum } from '../../src/forever/effects';
import { TALENT_BY_ID } from '../../src/forever/talents';

describe('Agonizing Flames data keys (A3-019)', () => {
  it('names the Searing Pain crit chance and the Destruction damage bonus, 10% each at 3/3 (values unchanged)', () => {
    expect(effectNum('agonizing_flames', 'searingPainCritPctAtMax')).toBe(0.1);
    expect(effectNum('agonizing_flames', 'destroDmgAtMax')).toBe(0.1);
  });
  it('the misleading crit damage key is gone', () => {
    expect(TALENT_BY_ID.get('agonizing_flames')?.effect).not.toHaveProperty('critDmgPctAtMax');
  });
});
