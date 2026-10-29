import type { School } from '../engine/types';

/** Whole number with thousands separators (locale-independent, for stable output). */
export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Seconds with one decimal, e.g. 1500 -> "1.5". */
export function secondsText(ms: number): string {
  return (ms / 1000).toFixed(1);
}

/** Aura or cooldown time left: "12s" (rounded up), "5m" from two minutes on. */
export function remainingText(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return s >= 120 ? `${Math.ceil(s / 60)}m` : `${s}s`;
}

/** Up to three initials of the capitalised words ("Curse of Agony" -> "CA"); one word -> "Sh". */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[A-Z]/.test(w));
  if (words.length <= 1) return name.slice(0, 2);
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('');
}

/** Tile colour per school (the icon files are not bundled). */
export const SCHOOL_COLORS: Record<School, string> = {
  shadow: '#6b3fa0',
  fire: '#c4501b',
  arcane: '#b03c9b',
  frost: '#2f7fc1',
  nature: '#3f8f3a',
  holy: '#b8962e',
  physical: '#7a6a58',
};
