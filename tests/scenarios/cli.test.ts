// The scenario command line (Task 3): `validateMain` / `runMain` called directly with an in-memory
// IO, and the npm scripts spawned once each through tsx (exit codes, output).

import { describe, expect, it } from 'vitest';
import { itemDbSync } from '../../src/data/items/dbSync';
import { formatIssue, runMain, validateMain, type CliIo } from '../../src/scenarios/cli';
import { SCENARIO_FORMAT } from '../../src/scenarios/types';

const db = itemDbSync();

function io(files: Record<string, string>) {
  const out: string[] = [];
  const err: string[] = [];
  const cli: CliIo = {
    readFile: (p) => {
      if (!Object.hasOwn(files, p)) throw new Error(`ENOENT: no such file '${p}'`);
      return files[p]!;
    },
    out: (l) => out.push(l),
    err: (l) => err.push(l),
  };
  return { cli, out, err };
}

const good = JSON.stringify({
  format: SCENARIO_FORMAT,
  version: 1,
  name: 'Good',
  simulation: { runs: 20, seed: 3 },
  script: {
    rules: [
      { action: 'cast', id: 'curse-of-the-elements', if: '!target.aura.curse-of-the-elements.active' },
      { action: 'cast', id: 'life-tap', if: 'mana < manaCost(shadow-bolt)' },
      { action: 'cast', id: 'shadow-bolt' },
    ],
  },
});
const warn = JSON.stringify({ format: SCENARIO_FORMAT, version: 1, name: 'Warn', setup: { enabledBuffs: ['heroizm'] }, script: { rules: [{ action: 'cast', id: 'shadow-blot' }, { action: 'cast', id: 'shadow-bolt' }] } });
const bad = JSON.stringify({ format: SCENARIO_FORMAT, version: 1, name: 'Bad', simulation: { runs: 0 }, script: { rules: [{ action: 'cast', id: 'shadow-bolt', if: '(mana < 5' }] } });

describe('scenario:validate', () => {
  it('a valid file: OK, exit 0', () => {
    const t = io({ 'good.json': good });
    expect(validateMain(['good.json'], t.cli, db)).toBe(0);
    expect(t.out).toEqual(['good.json: OK - "Good"']);
  });

  it('warnings only: exit 0, one line per warning with path and suggestion', () => {
    const t = io({ 'w.json': warn });
    expect(validateMain(['w.json'], t.cli, db)).toBe(0);
    expect(t.out[0]).toBe('w.json: OK (3 warnings) - "Warn"');
    expect(t.out).toContain("  warning setup.enabledBuffs[0]: unknown buff 'heroizm' (ignored) (did you mean 'heroism'?)");
    expect(t.out).toContain("  warning script.rules[0].id: unknown spell 'shadow-blot' (did you mean 'shadow-bolt'?)");
    expect(t.out.some((l) => l.startsWith('  warning script.rules[0]: rule left out'))).toBe(true);
  });

  it('errors: exit 1, each with its path; several files; unreadable file; no file', () => {
    const t = io({ 'bad.json': bad, 'good.json': good, 'junk.json': '{' });
    expect(validateMain(['bad.json', 'good.json', 'junk.json', 'missing.json'], t.cli, db)).toBe(1);
    expect(t.out[0]).toBe('bad.json: 2 errors, 0 warnings - "Bad"');
    expect(t.out).toContain('  error   simulation.runs: runs must be an integer from 1 to 100000 (got 0)');
    expect(t.out.some((l) => l.startsWith('  error   script.rules[0].if: column 10:'))).toBe(true);
    expect(t.out).toContain('good.json: OK - "Good"');
    expect(t.out.some((l) => l.startsWith('junk.json: 1 error, 0 warnings') )).toBe(true);
    expect(t.out.some((l) => l.startsWith('  error   (file): not valid JSON'))).toBe(true);
    expect(t.err[0]).toMatch(/^missing\.json: cannot read the file/);
    const none = io({});
    expect(validateMain([], none.cli, db)).toBe(2);
    expect(none.err[0]).toMatch(/usage/);
  });

  it('formatIssue', () => {
    expect(formatIssue('error', { path: 'name', message: 'x' })).toBe('error   name: x');
    expect(formatIssue('warning', { path: '', message: 'y', suggestion: 'z' })).toBe("warning (file): y (did you mean 'z'?)");
  });
});

describe('scenario:run', () => {
  it('prints mean, sigma, SEM, CI, per-spell share; deterministic for the same seed; the file settings as defaults', async () => {
    const a = io({ 'good.json': good });
    const b = io({ 'good.json': good });
    expect(await runMain(['good.json'], a.cli, db)).toBe(0);
    expect(await runMain(['good.json', '--runs', '20', '--seed', '3'], b.cli, db)).toBe(0);
    expect(a.out).toEqual(b.out);
    expect(a.out[0]).toBe('Scenario: Good (good.json)');
    expect(a.out).toContain('Runs: 20, seed 3, spell queue window 400 ms');
    expect(a.out.some((l) => /^Mean DPS: \d+\.\d\d$/.test(l))).toBe(true);
    expect(a.out.some((l) => /^Sigma: \d+\.\d\d {3}SEM: \d+\.\d\d {3}95% CI: \d+\.\d\d - \d+\.\d\d$/.test(l))).toBe(true);
    expect(a.out.some((l) => /^ {2}Shadow Bolt +\d+\.\d%/.test(l))).toBe(true);
    expect(a.out.some((l) => l.startsWith('Rule fires per fight'))).toBe(true);
    const c = io({ 'good.json': good });
    await runMain(['good.json', '--seed', '4'], c.cli, db);
    expect(c.out).not.toEqual(a.out);
  });

  it('--json: one JSON object with the numbers; warnings go to stderr and the run goes on', async () => {
    const t = io({ 'w.json': warn });
    expect(await runMain(['w.json', '--runs', '10', '--json'], t.cli, db)).toBe(0);
    const j = JSON.parse(t.out.join('\n'));
    expect(j).toMatchObject({ file: 'w.json', name: 'Warn', runs: 10, seed: 1, fightSec: 60 });
    expect(j.ci95).toHaveLength(2);
    expect(j.stdErr).toBeCloseTo(j.stdDev / Math.sqrt(10), 9);
    expect(j.perSpell['shadow-bolt'].share).toBeGreaterThan(0.9);
    expect(j.warnings).toHaveLength(3);
    expect(t.err).toHaveLength(3);
  });

  it('errors: not run, exit 1; bad options: exit 2', async () => {
    const t = io({ 'bad.json': bad });
    expect(await runMain(['bad.json'], t.cli, db)).toBe(1);
    expect(t.err[0]).toBe('bad.json: 2 errors: not run');
    expect(await runMain(['missing.json'], t.cli, db)).toBe(1);
    for (const args of [[], ['a.json', '--runs', '0'], ['a.json', '--seed', '-1'], ['a.json', '--runs'], ['a.json', '--fast'], ['a.json', 'b.json']]) {
      const u = io({});
      expect(await runMain(args, u.cli, db)).toBe(2);
      expect(u.err.join('\n')).toMatch(/usage/);
    }
  });
});

describe('npm scripts (spawned through tsx)', () => {
  type ChildProcess = {
    spawnSync(cmd: string, args: string[], opts: { cwd: string; encoding: 'utf8'; timeout: number }): { status: number | null; stdout: string; stderr: string };
  };
  const cwd = new URL('../../', import.meta.url).pathname;
  const run = async (script: string, args: string[]) => {
    const cp = (await import(/* @vite-ignore */ 'node:child_process' as string)) as ChildProcess;
    return cp.spawnSync('npx', ['tsx', script, ...args], { cwd, encoding: 'utf8', timeout: 60_000 });
  };

  it('scenario:validate exits 0 on the examples and 1 on a missing file', async () => {
    const ok = await run('scripts/scenario-validate.ts', ['docs/scenarios/trinket-sequencing.json', 'docs/scenarios/burst-potion.json']);
    expect(ok.stdout).toContain('docs/scenarios/trinket-sequencing.json: OK');
    expect(ok.status).toBe(0);
    const missing = await run('scripts/scenario-validate.ts', ['docs/scenarios/nope.json']);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('cannot read the file');
  }, 60_000);

  it('scenario:run prints the result', async () => {
    const r = await run('scripts/scenario-run.ts', ['docs/scenarios/shadowburn-hold.json', '--runs', '5', '--seed', '2']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Runs: 5, seed 2');
    expect(r.stdout).toMatch(/Mean DPS: \d/);
  }, 60_000);
});
