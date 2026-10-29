// Projectile travel time. Framework-free and pure.

/**
 * How long a missile flying at `missileSpeed` yd/s takes to cover `distanceYd` yards, in whole
 * ms: `Math.round(distanceYd / missileSpeed * 1000)` (wowsims `TravelTime`: distance / speed).
 * 0 (lands at once) when the spell has no missile (speed missing, 0, negative or not finite),
 * when the distance is 0, negative or not finite, and when the quotient overflows to an infinite
 * time (a denormal speed), so the result is always a finite non-negative integer.
 */
export function projectileTravelMs(missileSpeed: number | undefined, distanceYd: number): number {
  if (missileSpeed === undefined || !Number.isFinite(missileSpeed) || missileSpeed <= 0) return 0;
  if (!Number.isFinite(distanceYd) || distanceYd <= 0) return 0;
  const ms = Math.round((distanceYd / missileSpeed) * 1000);
  return Number.isFinite(ms) ? ms : 0;
}
