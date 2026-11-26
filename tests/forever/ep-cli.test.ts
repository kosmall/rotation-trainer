import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const run = (...args: string[]) => spawnSync('npx', ['tsx', 'scripts/forever-ep.ts', ...args], { encoding: 'utf8' });

describe('forever:ep command', () => {
  it('prints the weights table for one build and level', () => {
    const r = run('--build', 'AFF_WRACK', '--levels', '50', '--sessions', '6', '--param', 'session_pulls=6');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Level 50');
    expect(r.stdout).toContain('spellPower');
  });
  it('rejects an unknown build and lists the known ones', () => {
    const r = run('--build', 'NOPE', '--levels', '50', '--sessions', '6');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('AFF_WRACK');
  });
  it('rejects fewer than two sessions', () => {
    const r = run('--build', 'AFF_WRACK', '--levels', '50', '--sessions', '1');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('sessions');
  });
}, 60000);
