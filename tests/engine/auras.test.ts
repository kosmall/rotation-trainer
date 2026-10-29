import { describe, expect, it } from 'vitest';
import { AuraTracker } from '../../src/engine/auras';
import type { AuraDef } from '../../src/engine/types';

const base = { name: 'x', icon: 'x' };
const defs: AuraDef[] = [
  { ...base, id: 'dot', durationMs: 15000 },
  { ...base, id: 'stacker', durationMs: 10000, maxStacks: 3 },
  { ...base, id: 'shadowVuln', durationMs: 12000, charges: 2, damageTakenMult: { schools: ['shadow'], mult: 1.2 } },
  { ...base, id: 'fireVuln', durationMs: 12000, damageTakenMult: { schools: ['fire'], mult: 1.1 } },
  { ...base, id: 'shadowVuln2', durationMs: 5000, damageTakenMult: { schools: ['shadow', 'frost'], mult: 1.5 } },
];

describe('AuraTracker', () => {
  it('get returns remainingMs and undefined after expiry', () => {
    const t = new AuraTracker(defs);
    expect(t.get('dot', 0)).toBeUndefined();
    t.apply('dot', 1000);
    expect(t.get('dot', 1000)).toEqual({ auraId: 'dot', stacks: 1, charges: 0, remainingMs: 15000 });
    expect(t.get('dot', 6000)?.remainingMs).toBe(10000);
    expect(t.get('dot', 15999)?.remainingMs).toBe(1);
    expect(t.get('dot', 16000)).toBeUndefined();
    expect(t.get('dot', 20000)).toBeUndefined();
  });

  it('reapply resets duration', () => {
    const t = new AuraTracker(defs);
    t.apply('dot', 0);
    t.apply('dot', 10000);
    expect(t.get('dot', 10000)?.remainingMs).toBe(15000);
    expect(t.get('dot', 24999)?.remainingMs).toBe(1);
    expect(t.get('dot', 25000)).toBeUndefined();
  });

  it('reapplying an expired aura starts fresh', () => {
    const t = new AuraTracker(defs);
    t.apply('stacker', 0);
    t.apply('stacker', 5000);
    t.apply('stacker', 20000);
    expect(t.get('stacker', 20000)?.stacks).toBe(1);
  });

  it('stacks cap at maxStacks', () => {
    const t = new AuraTracker(defs);
    for (let i = 0; i < 5; i++) t.apply('stacker', 0);
    expect(t.get('stacker', 0)?.stacks).toBe(3);
    t.apply('dot', 0);
    t.apply('dot', 0);
    expect(t.get('dot', 0)?.stacks).toBe(1);
  });

  it('remove returns whether an aura was active', () => {
    const t = new AuraTracker(defs);
    expect(t.remove('dot')).toBe(false);
    t.apply('dot', 0);
    expect(t.remove('dot')).toBe(true);
    expect(t.get('dot', 0)).toBeUndefined();
  });

  it('applying an unknown aura throws', () => {
    const t = new AuraTracker(defs);
    expect(() => t.apply('nope', 0)).toThrow();
  });

  it('consumeCharge decrements and removes aura at 0 charges', () => {
    const t = new AuraTracker(defs);
    t.apply('shadowVuln', 0);
    expect(t.get('shadowVuln', 0)?.charges).toBe(2);
    t.consumeCharge('shadowVuln', 100);
    expect(t.get('shadowVuln', 100)?.charges).toBe(1);
    t.consumeCharge('shadowVuln', 200);
    expect(t.get('shadowVuln', 200)).toBeUndefined();
    t.apply('shadowVuln', 300);
    expect(t.get('shadowVuln', 300)?.charges).toBe(2);
  });

  it('consumeCharge is a no-op for auras without charges or when absent', () => {
    const t = new AuraTracker(defs);
    t.apply('dot', 0);
    t.consumeCharge('dot', 0);
    expect(t.get('dot', 0)).toBeDefined();
    expect(() => t.consumeCharge('shadowVuln', 0)).not.toThrow();
  });

  it('damageTakenMult multiplies matching schools only, ignores other schools and expired auras', () => {
    const t = new AuraTracker(defs);
    expect(t.damageTakenMult('shadow', 0)).toBe(1);
    t.apply('shadowVuln', 0);
    t.apply('fireVuln', 0);
    expect(t.damageTakenMult('shadow', 0)).toBeCloseTo(1.2);
    expect(t.damageTakenMult('fire', 0)).toBeCloseTo(1.1);
    expect(t.damageTakenMult('nature', 0)).toBe(1);
    t.apply('shadowVuln2', 0);
    expect(t.damageTakenMult('shadow', 0)).toBeCloseTo(1.8);
    expect(t.damageTakenMult('frost', 0)).toBeCloseTo(1.5);
    expect(t.damageTakenMult('shadow', 5000)).toBeCloseTo(1.2);
    expect(t.damageTakenMult('shadow', 12000)).toBe(1);
  });

  it('views returns only active auras keyed by id', () => {
    const t = new AuraTracker(defs);
    t.apply('dot', 0);
    t.apply('shadowVuln2', 0);
    expect(Object.keys(t.views(1000)).sort()).toEqual(['dot', 'shadowVuln2']);
    expect(t.views(1000).dot?.remainingMs).toBe(14000);
    expect(Object.keys(t.views(6000))).toEqual(['dot']);
  });
});
