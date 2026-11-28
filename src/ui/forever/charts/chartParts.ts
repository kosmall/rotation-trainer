// Shared drawing choices of the simulator's charts: colours come from the CSS variables in forever.css.
export const colourOf = (slot: number | undefined): string => (slot === undefined ? 'var(--viz-context)' : `var(--viz-${slot + 1})`);

export const AXIS = { stroke: 'var(--viz-axis)', tick: { fill: 'var(--text-dim)', fontSize: 12 }, tickLine: false } as const;
export const GRID = 'var(--viz-grid)';
/** The wash behind the mark under the pointer (bar charts). */
export const BAND = { fill: 'var(--viz-band)' } as const;

/** Numbers as the tables of the simulator write them. */
export const fmt = (x: number, decimals = 1): string => x.toFixed(decimals);
export const signed = (x: number, decimals = 1): string => `${x > 0 ? '+' : ''}${x.toFixed(decimals)}`;
