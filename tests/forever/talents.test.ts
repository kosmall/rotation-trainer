import { describe, expect, it } from 'vitest';
import { TALENTS, pointsAtLevel, talentRanks, validateBuild, validatePicks } from '../../src/forever/talents';

const rep = (id: string, n: number): string[] => Array(n).fill(id);

describe('talent trees', () => {
  it('has the Wowhead tree sizes: 17 affliction, 19 demonology, 16 destruction', () => {
    const count = (t: string) => TALENTS.filter((x) => x.tree === t).length;
    expect([count('aff'), count('demo'), count('destro')]).toEqual([17, 19, 16]);
  });
  it('every talent is modelled with an effect or unmodelled with a reason, never both', () => {
    for (const t of TALENTS) {
      if (t.status === 'modelled') expect(t.effect, t.id).toBeDefined();
      else expect(t.reason, t.id).toBeTruthy();
    }
  });
  it('points: none before 10, 1 per level, 51 at 60, perk adds', () => {
    expect(pointsAtLevel(9)).toBe(0);
    expect(pointsAtLevel(10)).toBe(1);
    expect(pointsAtLevel(40)).toBe(31);
    expect(pointsAtLevel(60)).toBe(51);
    expect(pointsAtLevel(40, 3)).toBe(34);
    expect(pointsAtLevel(60, 5)).toBe(51);
  });
  it('rejects a row-1 talent with 4 points in the tree, accepts with 5', () => {
    expect(validatePicks([...rep('improved_corruption', 4), 'soul_harvest']).ok).toBe(false);
    expect(validatePicks([...rep('improved_corruption', 5), 'soul_harvest']).ok).toBe(true);
  });
  it('rejects Wrack without Siphon Life and Demonic Pact without Soul Link', () => {
    const aff30 = [...rep('improved_corruption', 5), ...rep('improved_drains', 3), ...rep('soul_harvest', 2), ...rep('fel_concentration', 3), 'amplify_curse', ...rep('nightfall', 2), ...rep('malevolence', 5), ...rep('soul_siphon', 3), ...rep('shadow_mastery', 5)];
    expect(validatePicks([...aff30, 'wrack']).errors.join()).toContain('wrack needs siphon_life');
    const demo30 = [...rep('unholy_power', 5), ...rep('fel_vitality', 3), ...rep('demonic_energies', 2), ...rep('demonic_aegis', 2), ...rep('improved_sayaad', 3), ...rep('demonic_brand', 3), ...rep('master_summoner', 2), 'demonic_sacrifice', ...rep('demonic_knowledge', 3), ...rep('master_demonologist', 5)];
    expect(validatePicks([...demo30, 'demonic_pact']).errors.join()).toContain('demonic_pact needs soul_link');
  });
  it('rejects rank above max and unknown talents', () => {
    expect(validatePicks(rep('suppression', 6)).ok).toBe(false);
    expect(validatePicks(['nope']).ok).toBe(false);
  });
  it('rejects more points than picks, and talentRanks truncates to the level', () => {
    expect(validateBuild(rep('improved_corruption', 5), 20).ok).toBe(false);
    expect(talentRanks(rep('improved_corruption', 5), 12)['improved_corruption']).toBe(3);
    expect(() => talentRanks(['wrack'], 10)).toThrow();
  });
});
