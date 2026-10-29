import type { AuraDef, AuraView, School } from './types';

interface ActiveAura {
  stacks: number;
  charges: number;
  expiresAtMs: number;
}

/**
 * Pure aura state. No timers or events: expiry is evaluated lazily from the
 * `nowMs` passed to each query.
 */
export class AuraTracker {
  private readonly defs = new Map<string, AuraDef>();
  private readonly active = new Map<string, ActiveAura>();

  constructor(defs: AuraDef[]) {
    for (const d of defs) this.defs.set(d.id, d);
  }

  /**
   * Applies or refreshes `id`: one more stack (up to `maxStacks`), full charges, and it expires
   * `durationMs` (default: the def's own duration) from `nowMs`.
   */
  apply(id: string, nowMs: number, durationMs?: number): void {
    const def = this.defs.get(id);
    if (!def) throw new Error(`unknown aura: ${id}`);
    const cur = this.live(id, nowMs);
    const maxStacks = def.maxStacks ?? 1;
    this.active.set(id, {
      stacks: Math.min((cur?.stacks ?? 0) + 1, maxStacks),
      charges: def.charges ?? 0,
      expiresAtMs: nowMs + (durationMs ?? def.durationMs),
    });
  }

  remove(id: string): boolean {
    return this.active.delete(id);
  }

  get(id: string, nowMs: number): AuraView | undefined {
    const a = this.live(id, nowMs);
    if (!a) return undefined;
    return { auraId: id, stacks: a.stacks, charges: a.charges, remainingMs: a.expiresAtMs - nowMs };
  }

  consumeCharge(id: string, nowMs: number): void {
    const a = this.live(id, nowMs);
    if (!a || a.charges <= 0) return;
    a.charges -= 1;
    if (a.charges === 0) this.active.delete(id);
  }

  damageTakenMult(school: School, nowMs: number): number {
    let mult = 1;
    for (const [id] of this.active) {
      if (!this.live(id, nowMs)) continue;
      const m = this.defs.get(id)?.damageTakenMult;
      if (m && m.schools.includes(school)) mult *= m.mult;
    }
    return mult;
  }

  views(nowMs: number): Record<string, AuraView> {
    const out: Record<string, AuraView> = {};
    for (const id of [...this.active.keys()]) {
      const v = this.get(id, nowMs);
      if (v) out[id] = v;
    }
    return out;
  }

  /** The active entry for `id`, dropping it if it has expired by `nowMs`. */
  private live(id: string, nowMs: number): ActiveAura | undefined {
    const a = this.active.get(id);
    if (!a) return undefined;
    if (nowMs >= a.expiresAtMs) {
      this.active.delete(id);
      return undefined;
    }
    return a;
  }
}
