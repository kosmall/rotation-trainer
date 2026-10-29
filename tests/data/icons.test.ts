import { describe, expect, it } from 'vitest';
import { destructionWarlock } from '../../src/data/classes/warlock/destruction';

// Icons are committed under public/icons/spells/ (fetched once by `npm run icons`).
const iconFiles = new Set(
  Object.keys(import.meta.glob('/public/icons/spells/*.jpg')).map((path) =>
    (path.split('/').pop() ?? '').replace(/\.jpg$/, ''),
  ),
);

const defs = [
  ...destructionWarlock.spells.map((def) => ({ kind: 'spell', def })),
  ...destructionWarlock.auras.map((def) => ({ kind: 'aura', def })),
];

describe('spell and aura icons', () => {
  it('every spell and aura has a Wowhead id and a well-formed icon name', () => {
    for (const { kind, def } of defs) {
      expect(def.wowheadId, `${kind} ${def.id} wowheadId`).toBeGreaterThan(0);
      expect(def.icon, `${kind} ${def.id} icon`).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('every icon is committed as public/icons/spells/<icon>.jpg', () => {
    for (const { kind, def } of defs) {
      expect(iconFiles.has(def.icon), `${kind} ${def.id}: missing public/icons/spells/${def.icon}.jpg (run npm run icons)`).toBe(true);
    }
  });

  it('spells and the auras they apply share the same Wowhead id and icon', () => {
    for (const spell of destructionWarlock.spells) {
      const aura = destructionWarlock.auras.find((a) => a.id === spell.applyAura?.auraId);
      if (!aura) continue;
      expect([aura.id, aura.wowheadId, aura.icon]).toEqual([aura.id, spell.wowheadId, spell.icon]);
    }
  });
});
