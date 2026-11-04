// Screenshots of the real app (UI redesign Task 5, visual regression): every route at 1440 dark and
// light, 1024 dark, 390 dark and light, into docs/design/app/<route>-<width>-<theme>.png. Fails when
// a page logs a console error or scrolls horizontally.
//
//   npm run build && npm run screens            (the build is what it serves)
//   npm run screens -- --out <dir> --full       (another folder; full-page shots)
//
// It starts `vite preview` itself and stops it by its PID (never by name). Playwright is not a
// dependency of the project: the global install is used (`npm root -g`). Outside `npm test`.
//
// The data: one 20 s fight with the "Raid as in my log" setup and a fixed key pattern, played once
// (ready, running and ended shots); two example scenarios saved to the library; a 1,000-fight
// simulation (seed 41207) for the Simulator tab and a 500-run comparison of the current setup with
// the two scenarios for the Compare tab, then the Setup sections (their summary shows that run);
// last, the trinket example applied, for the script editor (setup-rotation-script). Each route is
// shot in every variant in turn.

import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outDir = resolve(root, args.includes('--out') ? args[args.indexOf('--out') + 1] : 'docs/design/app');
const fullPage = args.includes('--full');
const PORT = 4987;
const BASE = `http://localhost:${PORT}/`;

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(join(globalRoot, 'playwright'));
  }
}

const SETUP_SECTIONS = ['gear', 'talents', 'buffs', 'items', 'rotation', 'fight', 'class', 'scenarios', 'combat-text'];
const REPORT_TABS = ['damage', 'timeline', 'log', 'rotation', 'simulator', 'compare'];
const VARIANTS = [
  { width: 1440, height: 900, theme: 'dark' },
  { width: 1440, height: 900, theme: 'light' },
  { width: 1024, height: 768, theme: 'dark' },
  { width: 390, height: 844, theme: 'dark' },
  { width: 390, height: 844, theme: 'light' },
];
/** Example scenarios (docs/scenarios) saved to the library for the Scenarios and Compare shots. */
const EXAMPLES_TO_SAVE = ['Potion and Icon in the Heroism window', 'Shadowburn on cooldown, held for the finish'];
const KEYS = ['3', '2', '1', '1', '9', '1', '1', '6', '1', '1'];

async function waitForServer(url, ms = 15000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`vite preview did not answer at ${url}`);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const preview = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
  });
  const problems = [];
  let shots = 0;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  try {
    await waitForServer(BASE);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    await context.addInitScript(() => {
      // A fresh start: the default setup, the dark theme (the shots switch it with the header's button).
      if (!sessionStorage.getItem('screens-started')) {
        localStorage.clear();
        sessionStorage.setItem('screens-started', '1');
      }
    });
    const page = await context.newPage();
    let route = '';
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`${route}: console error: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`${route}: page error: ${String(e)}`));

    const go = async (hash) => {
      route = hash;
      await page.evaluate((h) => {
        location.hash = h;
      }, hash);
      await page.waitForTimeout(500);
    };
    const setTheme = async (theme) => {
      const current = await page.evaluate(() => document.documentElement.dataset.theme);
      if (current !== theme) await page.click(`button[aria-label="Switch to ${theme} theme"]`);
    };
    const capture = async (name) => {
      for (const v of VARIANTS) {
        await page.setViewportSize({ width: v.width, height: v.height });
        await setTheme(v.theme);
        await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
        await page.waitForTimeout(150);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (overflow > 0) problems.push(`${route} ${v.width} ${v.theme}: ${overflow} px of horizontal overflow`);
        await page.screenshot({ path: join(outDir, `${name}-${v.width}-${v.theme}.png`), fullPage });
        shots++;
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    };

    await page.goto(`${BASE}#/setup/buffs`);
    route = '#/setup/buffs';
    await page.waitForTimeout(800);
    await setTheme('dark');
    await page.click('button:text-is("Raid as in my log")');
    await go('#/setup/fight');
    await page.getByRole('spinbutton', { name: 'Fight length (s)' }).fill('20');
    await page.keyboard.press('Tab');

    // Fight: ready, running (about 9 s in), ended.
    await go('#/fight');
    await capture('fight-ready');
    await page.keyboard.press(' ');
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press(KEYS[i % KEYS.length]);
      await page.waitForTimeout(1000);
    }
    await capture('fight-running');
    for (let i = 9; i < 24; i++) {
      await page.keyboard.press(KEYS[i % KEYS.length]);
      await page.waitForTimeout(1000);
    }
    await capture('fight-ended');

    // Two example scenarios in the library (the setup itself is unchanged).
    await go('#/setup/scenarios');
    await page.waitForSelector('[aria-label="Example scenarios"]');
    for (const name of EXAMPLES_TO_SAVE) await page.click(`button[aria-label="Save to Library ${name}"]`);

    for (const tab of REPORT_TABS) {
      await go(`#/report/${tab}`);
      if (tab === 'simulator') {
        await page.fill('input[placeholder="random…"]', '41207');
        await page.click('button.sim-run');
        await page.waitForSelector('[aria-label="Simulation result"]', { timeout: 120000 });
        await page.waitForTimeout(300);
      }
      if (tab === 'compare') {
        for (const name of EXAMPLES_TO_SAVE) await page.getByRole('checkbox', { name: new RegExp(`^${name}`) }).check();
        await page.getByRole('spinbutton', { name: 'Runs' }).fill('500');
        await page.getByRole('spinbutton', { name: 'Seed' }).fill('41207');
        await page.click('button.sim-run');
        await page.waitForSelector('[aria-label="Comparison result"]', { timeout: 120000 });
        await page.waitForTimeout(300);
      }
      await capture(`report-${tab}`);
    }
    // After the Report: the Setup summary's "Simulate this setup" shows the run.
    for (const section of SETUP_SECTIONS) {
      await go(`#/setup/${section}`);
      await capture(`setup-${section}`);
    }
    // The script editor with the user's trinket example (applied with its setup).
    await go('#/setup/scenarios');
    await page.click('button[aria-label="Apply Pipe, then Icon (trinket sequencing)…"]');
    await page.click('button:text-is("Apply Scenario")');
    await go('#/setup/rotation');
    await page.waitForSelector('[aria-label="Rotation rules"]');
    await capture('setup-rotation-script');
    await context.close();
  } finally {
    await browser.close();
    preview.kill('SIGTERM'); // by its PID: the node process running vite preview
  }
  console.log(`${shots} screenshots in ${outDir}`);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
