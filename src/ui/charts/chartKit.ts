// Shared pieces of the Report's SVG charts (UI redesign Task 4, spec §5.3 and §8; dataviz rules:
// one axis, thin marks, recessive grid, legend, tooltip, a table view). No dependency.

import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

/** Width of the chart before it is measured (and in jsdom, which has no layout). */
export const DEFAULT_CHART_WIDTH = 640;

/**
 * The element's content width, followed with a `ResizeObserver` (charts are drawn in pixels so
 * the axis labels stay 11 px at every width). Without one (old browsers, jsdom): `fallback`.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback = DEFAULT_CHART_WIDTH): number {
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = (w: number) => {
      if (w > 0) setWidth(Math.round(w));
    };
    measure(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) measure(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** A "nice" upper bound for an axis (1, 2, 2.5 or 5 × a power of ten), and its tick step. */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  if (!(max > 0) || !Number.isFinite(max)) return { max: 1, step: 0.25 };
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  return { max: step * Math.ceil(max / step), step };
}

/** Tick values from 0 to max by step (inclusive, rounded to kill float noise). */
export function tickValues(max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = 0; v <= max + step / 1000; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** Time ticks in seconds for a fight of `durationSec` across `px` pixels: every 10 s, 20 s or 30 s. */
export function timeTicks(durationSec: number, px: number): number[] {
  const fit = Math.max(2, Math.floor(px / 70));
  const step = [5, 10, 20, 30, 60, 120].find((s) => durationSec / s <= fit) ?? 300;
  const out: number[] = [];
  for (let t = 0; t <= durationSec + 1e-9; t += step) out.push(t);
  return out;
}

const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Axis numbers: "4,000". */
export function axisNumber(v: number): string {
  return NUM.format(v);
}
