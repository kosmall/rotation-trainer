// Combat text HUD: the text and look of each kind of text (scrolling combat text Task 1).
// Framework-free. Numbers use `formatInt` like the rest of the UI.

import { formatInt } from './format';
import type { HudSettings } from './hudSettings';

/** What a HUD text is about. */
export type HudKind =
  | 'damage'
  | 'crit'
  | 'tick'
  | 'miss'
  | 'buff-on'
  | 'buff-off'
  | 'proc'
  | 'debuff-on'
  | 'debuff-off'
  | 'mana'
  | 'item'
  | 'ready'
  | 'low-mana';

/**
 * Colours of the notification kinds (damage kinds use the school colour, `SCHOOL_COLORS`): buff on
 * green, buff off red, proc gold, mana blue (design spec §4). The renderer adds an outline/shadow
 * so each reads on the dark and the light theme.
 */
export const HUD_COLORS: Readonly<Record<'miss' | 'buff-on' | 'buff-off' | 'proc' | 'debuff-on' | 'debuff-off' | 'mana' | 'item' | 'ready' | 'low-mana', string>> =
  Object.freeze({
    miss: '#a8a8a8',
    'buff-on': '#3fbf4a',
    'buff-off': '#d9534f',
    proc: '#f0c419',
    'debuff-on': '#b07cd8',
    'debuff-off': '#8c8c8c',
    mana: '#3b8fe0',
    item: '#e6dcc8',
    ready: '#4fc3c7',
    'low-mana': '#ff7043',
  });

/** What a text says: its kind, its amount (damage, mana) and its name (spell, aura, item). */
export interface HudTextInput {
  kind: HudKind;
  amount?: number;
  name?: string;
}

/**
 * The text of a HUD event: damage "3,141" ("Shadow Bolt 3,141" with spell names), crit "4,712!",
 * tick like damage, miss "Miss", buffs and target debuffs "+Name" / "-Name", proc "Name!", mana
 * "+1,622 Mana", item use "Name", ready "Name ready", low mana "Low Mana".
 */
export function formatHudText(event: HudTextInput, settings: Pick<HudSettings, 'showSpellNames'>): string {
  const name = event.name ?? '';
  const amount = formatInt(event.amount ?? 0);
  const named = (s: string) => (settings.showSpellNames && name !== '' ? `${name} ${s}` : s);
  switch (event.kind) {
    case 'damage':
    case 'tick':
      return named(amount);
    case 'crit':
      return named(`${amount}!`);
    case 'miss':
      return named('Miss');
    case 'buff-on':
    case 'debuff-on':
      return `+${name}`;
    case 'buff-off':
    case 'debuff-off':
      return `-${name}`;
    case 'proc':
      return `${name}!`;
    case 'mana':
      return `+${amount} Mana`;
    case 'item':
      return name;
    case 'ready':
      return `${name} ready`;
    case 'low-mana':
      return 'Low Mana';
  }
}

/** Size of a tick relative to `fontPx`, and its opacity: smaller and lighter than a hit. */
const HUD_TICK_SCALE = 0.85;
const HUD_TICK_OPACITY = 0.8;

/** How a kind of text looks: crits `fontPx x critScale` and bold, ticks smaller and lighter, procs bold. */
export function hudTextStyle(kind: HudKind, settings: Pick<HudSettings, 'fontPx' | 'critScale'>): { fontPx: number; bold: boolean; opacity: number } {
  switch (kind) {
    case 'crit':
      return { fontPx: Math.round(settings.fontPx * settings.critScale), bold: true, opacity: 1 };
    case 'tick':
      return { fontPx: Math.round(settings.fontPx * HUD_TICK_SCALE), bold: false, opacity: HUD_TICK_OPACITY };
    case 'proc':
    case 'low-mana':
      return { fontPx: settings.fontPx, bold: true, opacity: 1 };
    default:
      return { fontPx: settings.fontPx, bold: false, opacity: 1 };
  }
}
