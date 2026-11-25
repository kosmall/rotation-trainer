// `npm run forever:report [-- --sessions 100 --seed 1]` writes reports/forever_leveling_40plus.md
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_REPORT_OPTIONS, buildReport } from '../src/forever/report';

const args = process.argv.slice(2);
const arg = (name: string, def: number): number => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def;
};
const o = { ...DEFAULT_REPORT_OPTIONS, sessions: arg('sessions', DEFAULT_REPORT_OPTIONS.sessions), sensSessions: arg('sens-sessions', DEFAULT_REPORT_OPTIONS.sensSessions), optSessions: arg('opt-sessions', DEFAULT_REPORT_OPTIONS.optSessions), seed: arg('seed', 1) };
const text = buildReport(o);
mkdirSync('reports', { recursive: true });
writeFileSync('reports/forever_leveling_40plus.md', text);
console.log(`written reports/forever_leveling_40plus.md (${text.length} characters)`);
