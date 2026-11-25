import { describe, expect, it } from 'vitest';
import { buildReport } from '../../src/forever/report';
import { collectVerify } from '../../src/forever/verify';

const quick = { levels: [45, 50], respecLevels: [38, 40, 45], sessions: 4, sensSessions: 3, sensLevels: [45, 50], optSessions: 3, optToLevel: 33 + 28, seed: 1, quick: true };

describe('report', () => {
  const text = buildReport({ ...quick, optToLevel: 60 });
  it('has the sections the task asks for', () => {
    for (const h of ['## 1. Comparison of all builds', '## 2. Respec to Demonology', '## 3. Bane 2/5 + Shadow Bolt rank 1', '## 6. Sensitivity', '## 7. All assumptions', '## 8. What is not modelled']) expect(text).toContain(h);
  });
  it('lists every verify assumption', () => {
    for (const a of collectVerify()) expect(text).toContain(`| ${a.file} | ${a.name} |`);
  });
  it('states the answer to the Bane question and a respec recommendation', () => {
    expect(text).toMatch(/Recommendation\./);
    expect(text).toContain('Bane 5/5 + rank 2');
  });
  it('contains a table row per build', () => {
    expect(text.match(/^\| DEMO_PACT_R1 \|/gm)!.length).toBeGreaterThan(2);
  });
});
