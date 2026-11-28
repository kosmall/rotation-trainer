import { describe, expect, it } from 'vitest';
import { resolveMobs, runEpCli } from '../../src/forever/ep-cli';

const base = ['--levels', '50', '--sessions', '6', '--param', 'session_pulls=6'];

describe('forever:ep command', () => {
  it('prints the weights table for one build and level', () => {
    const r = runEpCli(['--build', 'AFF_WRACK', ...base]);
    expect(r.text).toContain('Level 50');
    expect(r.text).toContain('spellPower');
    expect(r.out).toBeUndefined();
  });
  it('hands back the output path', () => {
    expect(runEpCli(['--build', 'AFF_WRACK', ...base, '--out', 'reports/x.md']).out).toBe('reports/x.md');
  });
  it('compares several builds', () => {
    const r = runEpCli(['--builds', 'AFF_WRACK,DEMO_PACT_R1', ...base]);
    expect(r.text).toContain('AFF_WRACK vs DEMO_PACT_R1');
  });
  it('a larger --delta is used for that stat', () => {
    expect(runEpCli(['--build', 'AFF_WRACK', ...base, '--delta', 'spellPower=20']).text).toContain('Level 50');
    expect(() => runEpCli(['--build', 'AFF_WRACK', ...base, '--delta', 'luck=20'])).toThrow(/--delta/);
  });
  it('A5-012: --param mobs_per_pull=2 acts like --mobs 2, and the default stays one mob', () => {
    const one = runEpCli(['--build', 'AFF_WRACK', ...base]).text;
    const viaMobs = runEpCli(['--build', 'AFF_WRACK', ...base, '--mobs', '2']).text;
    const viaParam = runEpCli(['--build', 'AFF_WRACK', ...base, '--param', 'mobs_per_pull=2']).text;
    expect(viaMobs).not.toBe(one);
    expect(viaParam).toBe(viaMobs);
    expect(runEpCli(['--build', 'AFF_WRACK', ...base, '--mobs', '1']).text).toBe(one);
  });
  it('rejects an unknown build and lists the known ones', () => {
    expect(() => runEpCli(['--build', 'NOPE', ...base])).toThrow(/AFF_WRACK/);
  });
  it('rejects a bad --mobs instead of reporting that spell power gains nothing', () => {
    expect(() => runEpCli(['--build', 'AFF_WRACK', ...base, '--mobs', 'abc'])).toThrow(/mobs/);
    expect(() => runEpCli(['--build', 'AFF_WRACK', ...base, '--mobs', '5'])).toThrow(/mobs/);
  });
  it('rejects a reversed level range instead of printing an empty report', () => {
    expect(() => runEpCli(['--build', 'AFF_WRACK', '--sessions', '6', '--levels', '50-45'])).toThrow(/levels/);
  });
  it('rejects fewer than two sessions', () => {
    expect(() => runEpCli(['--build', 'AFF_WRACK', '--levels', '50', '--sessions', '1'])).toThrow(/sessions/);
  });
}, 60000);

describe('resolveMobs (A5-012)', () => {
  it('leaves mobs unset without --mobs so a --param mobs_per_pull applies', () => {
    const params: Record<string, unknown> = { mobs_per_pull: 2 };
    expect(resolveMobs('', params)).toBeUndefined();
    expect(params.mobs_per_pull).toBe(2);
  });
  it('--mobs wins and is written to the params too', () => {
    const params: Record<string, unknown> = { mobs_per_pull: 2 };
    expect(resolveMobs('3', params)).toBe(3);
    expect(params.mobs_per_pull).toBe(3);
  });
  it('rejects anything but 1, 2, 3', () => {
    expect(() => resolveMobs('5', {})).toThrow(/mobs/);
    expect(() => resolveMobs('abc', {})).toThrow(/mobs/);
  });
});
