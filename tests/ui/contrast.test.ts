// The contrast table of the UI redesign spec (§4.2), computed from the final stylesheets: the
// tokens of src/ui/theme/tokens.css (dark "Nether", light "Moonstone"), the arena's background and
// the resource bar's gradient stops of src/ui/fight/fight.css. WCAG 2.x ratios: at least 4.5 for
// text, 3 for the focus ring.

import { describe, expect, it } from 'vitest';

async function read(path: string): Promise<string> {
  // Vitest serves stylesheets empty, so the files are read from disk.
  const nodeFs = 'node:' + 'fs';
  const fs = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: string, encoding: 'utf8'): string };
  const root = decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/tests\/ui\/[^/]+$/, '');
  // LF as in the repository: a Windows checkout has CRLF, and the selectors looked up below span lines
  return fs.readFileSync(root + path, 'utf8').replaceAll('\r\n', '\n').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The declarations of the first rule whose selector is exactly `selector`. */
function block(css: string, selector: string): Record<string, string> {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule ${selector}`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

/** Resolves `var(--x)` chains to a hex colour. */
function resolve(vars: Record<string, string>, name: string): string {
  let value = vars[name];
  for (let i = 0; i < 5 && value?.startsWith('var('); i++) value = vars[value.slice(4, -1)];
  if (value && /^#[0-9a-f]{3}$/i.test(value)) value = `#${[...value.slice(1)].map((c) => c + c).join('')}`;
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not a hex colour: ${value}`);
  return value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

describe('WCAG contrast of the design tokens (spec §4.2)', () => {
  it('the formula: black on white is 21, the spec values come back (Parchment on the page 14.87, white on the mana token 3.42)', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#efe6d2', '#15121f')).toBeCloseTo(14.87, 2);
    expect(contrast('#ffffff', '#4a86ff')).toBeCloseTo(3.42, 2);
  });

  it('dark: every text colour on the page, the panel, the raised panel and the arena is at least 4.5', async () => {
    const tokens = await read('src/ui/theme/tokens.css');
    const fight = await read('src/ui/fight/fight.css');
    const dark = block(tokens, ":root,\n:root[data-theme='dark']");
    const arena = /\.fv \{[^}]*background: (#[0-9a-f]{6});/i.exec(fight)?.[1];
    expect(arena).toBeDefined();
    const backgrounds = { page: resolve(dark, '--page'), panel: resolve(dark, '--surface'), raised: resolve(dark, '--surface-2'), arena: arena! };
    const texts = ['--text', '--text-dim', '--trim', '--class', '--fel', '--danger', '--gold', '--school-shadow', '--school-fire', '--quality-epic', '--quality-rare'];
    for (const t of texts) {
      for (const [bg, hex] of Object.entries(backgrounds)) {
        expect(contrast(resolve(dark, t), hex), `${t} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // Mana as text: the page, the panel and the arena (on the raised panel only as a bar, 4.25).
    for (const bg of ['page', 'panel', 'arena'] as const) {
      expect(contrast(resolve(dark, '--mana'), backgrounds[bg]), `--mana on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    // The focus ring on the page: at least 3.
    expect(contrast(resolve(dark, '--focus'), backgrounds.page)).toBeGreaterThanOrEqual(3);
    // Text on a class-coloured button.
    expect(contrast(resolve(dark, '--on-class'), resolve(dark, '--class'))).toBeGreaterThanOrEqual(4.5);
  });

  it('light: the text colours on the page, the panel and the raised panel (fel and fire on the page) are at least 4.5', async () => {
    const tokens = await read('src/ui/theme/tokens.css');
    const dark = block(tokens, ":root,\n:root[data-theme='dark']");
    const light = { ...dark, ...block(tokens, ":root[data-theme='light']") };
    const backgrounds = { page: resolve(light, '--page'), panel: resolve(light, '--surface'), raised: resolve(light, '--surface-2') };
    for (const t of ['--text', '--text-dim', '--trim', '--class', '--danger', '--gold', '--school-shadow', '--quality-epic', '--quality-rare']) {
      for (const [bg, hex] of Object.entries(backgrounds)) {
        expect(contrast(resolve(light, t), hex), `${t} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const t of ['--fel', '--school-fire']) {
      expect(contrast(resolve(light, t), backgrounds.page), `${t} on page`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(resolve(light, '--focus'), backgrounds.page)).toBeGreaterThanOrEqual(3);
    expect(contrast(resolve(light, '--on-class'), resolve(light, '--class'))).toBeGreaterThanOrEqual(4.5);
  });

  it('bars: the cast text on the cast colour, the health text on fel, and the white mana label on every stop of the mana gradient', async () => {
    const tokens = await read('src/ui/theme/tokens.css');
    const fight = await read('src/ui/fight/fight.css');
    const dark = block(tokens, ":root,\n:root[data-theme='dark']");
    expect(contrast('#1a1306', resolve(dark, '--cast'))).toBeGreaterThanOrEqual(4.5);
    const health = /\.fv-bar-health > span \{[^}]*color: (#[0-9a-f]{6});/i.exec(fight)?.[1];
    expect(health).toBe('#0f1a08');
    expect(contrast(health!, resolve(dark, '--fel'))).toBeGreaterThanOrEqual(4.5);
    const label = /\.fv-bar > span \{[^}]*color: (#[0-9a-f]{3,6});/i.exec(fight)?.[1];
    expect(label).toBe('#fff');
    const gradient = /\.fv-bar-resource > i \{[^}]*background: linear-gradient\(([^;]*)\);/i.exec(fight)?.[1] ?? '';
    const stops = [...gradient.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]);
    expect(stops.length).toBeGreaterThanOrEqual(2);
    expect(stops).toContain('#3466d6'); // the spec's darker middle
    for (const stop of stops) expect(contrast('#ffffff', stop), `white on ${stop}`).toBeGreaterThanOrEqual(4.5);
  });
});
