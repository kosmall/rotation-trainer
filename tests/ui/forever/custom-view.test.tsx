import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { runJob } from '../../../src/forever/web/api';
import type { JobRunner } from '../../../src/forever/web/client';
import { CUSTOM_STORAGE_KEY } from '../../../src/forever/web/custom';
import { ForeverApp } from '../../../src/ui/forever/ForeverApp';

const runner: JobRunner = async (req, o) => runJob({ ...req, settings: { ...req.settings, sessions: 5 } } as typeof req, o?.onProgress);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const add = (name: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Dodaj punkt: ${name}:`) }));

describe('custom build tab', () => {
  it('opens with an empty tree, adds points in order, respects prerequisites and saves', async () => {
    render(<ForeverApp view="custom" runner={runner} />);
    expect(await screen.findByText(/Punkty:/)).toBeTruthy();
    expect(screen.getByText('0/51')).toBeTruthy();
    // Wrack needs Siphon Life and a row-6 unlock: not clickable yet.
    expect((screen.getByRole('button', { name: /^Dodaj punkt: Wrack:/ }) as HTMLButtonElement).disabled).toBe(true);
    add('Suppression');
    add('Improved Corruption');
    add('Suppression');
    const list = screen.getByRole('list', { name: 'Kolejność punktów' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringContaining('Suppression'), expect.stringContaining('Improved Corruption'), expect.stringContaining('Suppression')]);
    expect(screen.getByText('3/51')).toBeTruthy();
    const saved = JSON.parse(window.localStorage.getItem(CUSTOM_STORAGE_KEY) ?? '{}');
    expect(saved.builds[0].picks).toEqual(['suppression', 'improved_corruption', 'suppression']);
  });

  it('shows the last saved build when entered again', async () => {
    window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify({ builds: [{ name: 'Mój', picks: ['suppression', 'suppression'], rotation: 'affliction', filler: 'wrack', rank: 'max', pet: 'voidwalker', sacrificed: null }], active: 'Mój', included: [] }));
    render(<ForeverApp view="custom" runner={runner} />);
    expect(await screen.findByText('2/51')).toBeTruthy();
    expect((screen.getByLabelText('Nazwa') as HTMLInputElement).value).toBe('Mój');
  });

  it('refuses to remove a point that later points need', async () => {
    render(<ForeverApp view="custom" runner={runner} />);
    await screen.findByText(/Punkty:/);
    for (let i = 0; i < 5; i++) add('Suppression'); // 5 points open row 1
    add('Soul Harvest');
    fireEvent.click(screen.getByRole('button', { name: 'Usuń punkt 1' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Nie można/);
    expect(screen.getByText('6/51')).toBeTruthy();
  });

  it('runs the build and shows it in the ranking, highlighted', async () => {
    render(<ForeverApp view="custom" runner={runner} />);
    await screen.findByText(/Punkty:/);
    add('Suppression');
    fireEvent.click(screen.getByRole('button', { name: /Sprawdź na levelu/ }));
    const table = await screen.findByRole('table', { name: 'Ranking buildów' });
    await waitFor(() => expect(within(table).getByText('★ Własny build')).toBeTruthy());
    expect(table.querySelectorAll('tbody tr')).toHaveLength(9);
    expect(table.querySelector('.fv-mine')).toBeTruthy();
  });

  it('imports an exported build as a new one', async () => {
    render(<ForeverApp view="custom" runner={runner} />);
    await screen.findByText(/Punkty:/);
    add('Suppression');
    fireEvent.click(screen.getByRole('button', { name: 'Eksportuj bieżący' }));
    fireEvent.click(screen.getByRole('button', { name: 'Importuj jako nowy' }));
    await waitFor(() => expect((screen.getByLabelText('Nazwa') as HTMLInputElement).value).toBe('Własny build 2'));
  });
});
