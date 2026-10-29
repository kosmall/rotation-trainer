import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { destructionWarlock } from '../../src/data/classes/warlock/destruction';
import type { AuraView } from '../../src/engine/types';
import { GameView } from '../../src/ui/GameView';
import { SpellIcon, iconUrl } from '../../src/ui/SpellIcon';
import { AuraList } from '../../src/ui/TargetPanel';

afterEach(cleanup);

const spell = (id: string) => {
  const def = destructionWarlock.spells.find((s) => s.id === id);
  if (!def) throw new Error(`no spell ${id}`);
  return def;
};

const slotButton = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name} \\(`) });

describe('iconUrl', () => {
  it('points at the committed file under the app base path', () => {
    expect(iconUrl('spell_shadow_shadowbolt')).toBe(`${import.meta.env.BASE_URL}icons/spells/spell_shadow_shadowbolt.jpg`);
  });
});

describe('SpellIcon', () => {
  it('renders the image, and renders nothing once the image fails to load', () => {
    const { container } = render(<SpellIcon icon="spell_fire_fireball" className="x" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('/icons/spells/spell_fire_fireball.jpg');
    expect(img?.getAttribute('alt')).toBe('');
    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
  });

  it('tries again when it is given a different icon', () => {
    const { container, rerender } = render(<SpellIcon icon="spell_missing" className="x" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    rerender(<SpellIcon icon="spell_fire_fireball" className="x" />);
    expect(container.querySelector('img')?.getAttribute('src')).toContain('spell_fire_fireball.jpg');
  });
});

describe('action bar icons', () => {
  it('every bound slot shows its spell icon and the empty slot shows none', () => {
    const { container } = render(<GameView storage={null} />);
    const filled = destructionWarlock.keybinds.filter((id) => id !== '');
    expect(filled.length).toBeGreaterThan(0);
    for (const id of filled) {
      const def = spell(id);
      const img = slotButton(def.name).querySelector('img');
      expect(img?.getAttribute('src'), def.name).toContain(`/icons/spells/${def.icon}.jpg`);
    }
    // Slots: one image per bound slot, nothing for the intentionally empty slot 8.
    expect(container.querySelectorAll('.action-bar img').length).toBe(filled.length);
  });

  it('keeps the initials as the fallback when an icon file is missing', () => {
    render(<GameView storage={null} />);
    const button = slotButton('Shadow Bolt');
    fireEvent.error(button.querySelector('img') as HTMLImageElement);
    expect(button.querySelector('img')).toBeNull();
    expect(button.textContent).toContain('SB');
  });
});

describe('aura icons', () => {
  const view = (auraId: string, extra: Partial<AuraView> = {}): AuraView => ({
    auraId,
    stacks: 1,
    charges: 0,
    remainingMs: 12000,
    ...extra,
  });

  it('shows the aura icon on each chip, with its count', () => {
    render(
      <AuraList
        spec={destructionWarlock}
        label="Target debuffs"
        auras={{
          corruption: view('corruption'),
          'shadow-vulnerability': view('shadow-vulnerability', { charges: 4 }),
        }}
      />,
    );
    const chips = screen.getAllByRole('listitem');
    const corruption = chips.find((li) => li.textContent?.includes('Corruption'));
    const isb = chips.find((li) => li.textContent?.includes('Shadow Vulnerability'));
    const icon = (id: string) => destructionWarlock.auras.find((a) => a.id === id)?.icon;
    expect(corruption?.querySelector('img')?.getAttribute('src')).toContain(`/icons/spells/${icon('corruption')}.jpg`);
    expect(isb?.querySelector('img')?.getAttribute('src')).toContain(`/icons/spells/${icon('shadow-vulnerability')}.jpg`);
    expect(isb?.querySelector('.aura-count')?.textContent).toBe('4');
  });

  it('falls back to the initials when the aura icon fails', () => {
    render(<AuraList spec={destructionWarlock} label="Target debuffs" auras={{ corruption: view('corruption') }} />);
    const chip = screen.getByRole('listitem');
    fireEvent.error(chip.querySelector('img') as HTMLImageElement);
    expect(chip.querySelector('img')).toBeNull();
    expect(chip.querySelector('.aura-icon')?.textContent).toContain('Co');
  });
});
