// Small builders of rotation conditions, shared by the built-in rotation spec and the generated rotations.

import type { Cond } from './rotation-spec';

export const T: Cond = { op: 'true' };
export const all = (...of: (Cond | null)[]): Cond => {
  const list = of.filter((c): c is Cond => c !== null && c.op !== 'true');
  return list.length === 0 ? T : list.length === 1 ? (list[0] as Cond) : { op: 'all', of: list };
};
export const not = (of: Cond): Cond => ({ op: 'not', of });
export const knows = (spell: string): Cond => ({ op: 'knows', spell });
export const lacksDot = (spell: string): Cond => not({ op: 'target_has_dot', spell });
