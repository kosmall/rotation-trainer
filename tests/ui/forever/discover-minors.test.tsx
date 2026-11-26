import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { loadVariant } from '../../../src/forever/builds';
import { loadParams } from '../../../src/forever/data/load';
import { QUICK_BUDGET, type DiscoverOptions } from '../../../src/forever/discover/engine';
import type { RotationGenes } from '../../../src/forever/rotation-genes';
import { DEFAULT_SETTINGS } from '../../../src/forever/web/api';
import { CUSTOM_STORAGE_KEY } from '../../../src/forever/web/custom';
import { discoverPool, type DiscoverPool } from '../../../src/forever/web/discover-client';
import { SPELL_ICONS } from '../../../src/ui/forever/icons';
import { wrackFloor } from '../../../src/ui/forever/buildFacts';
import { ForeverApp } from '../../../src/ui/forever/ForeverApp';
import { useDiscover, type DiscoverTuning } from '../../../src/ui/forever/useDiscover';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const genes = (filler: RotationGenes['filler']): RotationGenes => ({ coe: false, agony: true, corruption: false, siphon: false, immolate: false, minTtkSec: 6, drainSoulFinisher: false, filler });

describe('review minors (UI)', () => {
  it('a stale run does not overwrite the status of a newer one', async () => {
    let n = 0;
    const factory = (_o: DiscoverOptions, signal: AbortSignal): DiscoverPool => {
      const mine = ++n;
      return {
        runner: () => new Promise((_, reject) => (mine === 1 ? signal.addEventListener('abort', () => setTimeout(() => reject(new DOMException('a', 'AbortError')), 5)) : undefined)),
        close: () => undefined,
      };
    };
    const { result } = renderHook(() => useDiscover(factory));
    act(() => result.current.run({ ...DEFAULT_SETTINGS, level: 40 }, 'quick'));
    act(() => result.current.run({ ...DEFAULT_SETTINGS, level: 40 }, 'quick'));
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.status).toBe('running');
  });

  it('the Wrack health floor follows the composed rotation', () => {
    const v = { ...loadVariant('AFF_WRACK') };
    const p = loadParams({ wrack_min_hp_pct: 0.6 });
    expect(wrackFloor({ ...v, genes: genes('drain_life') }, p)).toBe(0);
    expect(wrackFloor({ ...v, genes: genes('wrack_hp70') }, p)).toBe(0.7);
    expect(wrackFloor(v, p)).toBe(0.6);
  });

  it('Buildy shows the filler icon for a composed rotation', async () => {
    window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify({ builds: [{ name: 'Gen', picks: ['suppression'], rotation: 'affliction', filler: 'wrack', rank: 'max', pet: 'imp', sacrificed: null, genes: genes('searing_pain') }], active: 'Gen', included: [] }));
    render(<ForeverApp view="builds" />);
    fireEvent.change(await screen.findByLabelText(/Build/), { target: { value: '★ Gen' } });
    await screen.findAllByText(/Własna rotacja: Agony → Searing Pain/);
    const dt = screen.getAllByText('Rotacja').find((x) => x.tagName === 'DT') as HTMLElement;
    const dd = dt.nextElementSibling as HTMLElement;
    expect(dd.innerHTML).toContain(SPELL_ICONS.searing_pain as string);
  });

  it('the saved note goes away with the result it refers to', async () => {
    const tuning: DiscoverTuning = {
      space: { fillers: ['sb_r1'], minTtk: [6], pets: ['succubus'], sacrifice: false, maxDots: 0 },
      budget: { ...QUICK_BUDGET, keep: 2, perFamilyMin: 1, screen: { starts: 1, evals: 2, sessions: 1 }, search: { starts: 1, evals: 3, sessions: 1 }, final: 3, finalSessions: 3 },
    };
    const inline = (o: DiscoverOptions, s: AbortSignal) => discoverPool(o, 1, s, () => null);
    window.localStorage.setItem('wow-forever-sim:settings:v1', JSON.stringify({ ...DEFAULT_SETTINGS, level: 40 }));
    render(<ForeverApp view="discover" discoverPool={inline} discoverTuning={tuning} />);
    fireEvent.click(screen.getByRole('button', { name: 'Szukaj' }));
    await screen.findByRole('table', { name: 'Najlepsze znalezione buildy' }, { timeout: 60000 });
    fireEvent.click(screen.getAllByRole('button', { name: /Zapisz jako własny build/ })[0]!);
    expect(screen.getByText(/Zapisano:/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Szukaj' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Przerwij' })).toBeNull(), { timeout: 60000 });
    expect(screen.queryByText(/Zapisano:/)).toBeNull();
  }, 120000);
});
