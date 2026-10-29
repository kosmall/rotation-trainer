// Ready-made setups for the setup panel (stage 1.5 Part C, design spec §4.3).

import { deepFreeze } from '../data/common/buffs';
import { DEFAULT_SETUP } from './defaults';
import type { SetupConfig, SetupPresetId } from './types';

/**
 * - `none`: the default setup (no buffs; the stage 1 numbers).
 * - `raid-log`: the author's raid as in the Naj'entus log. For now a copy of `none`; Task 12
 *   fills in its buffs and timings.
 * Deep-frozen: copy a preset's config (structuredClone) before editing it.
 */
export const SETUP_PRESETS: Readonly<Record<SetupPresetId, { name: string; config: SetupConfig }>> = deepFreeze({
  none: { name: 'None', config: structuredClone(DEFAULT_SETUP) },
  'raid-log': { name: 'Raid as in my log', config: structuredClone(DEFAULT_SETUP) },
});
