import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { runJob } from '../../../src/forever/web/api';
import type { JobRunner } from '../../../src/forever/web/client';
import { ForeverApp } from '../../../src/ui/forever/ForeverApp';
import { parseRoute, routeHref } from '../../../src/ui/shell/router';

const runner: JobRunner = async (req, o) => {
  const r = runJob({ ...req, settings: { ...req.settings, sessions: 5 } } as typeof req, o?.onProgress);
  return r;
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('forever routes', () => {
  it('opens the simulator by default and parses forever views', () => {
    expect(parseRoute('')).toEqual({ mode: 'forever', view: 'sim' });
    expect(parseRoute('#/forever/compare')).toEqual({ mode: 'forever', view: 'compare' });
    expect(parseRoute('#/forever/nope')).toEqual({ mode: 'forever', view: 'sim' });
    expect(routeHref({ mode: 'forever', view: 'builds' })).toBe('#/forever/builds');
  });
});

describe('ForeverApp', () => {
  it('runs the ranking for the chosen level and shows the results', async () => {
    render(<ForeverApp view="sim" runner={runner} />);
    fireEvent.change(screen.getByLabelText('Level postaci (liczba)'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uruchom symulację' }));
    const table = await screen.findByRole('table', { name: 'Ranking buildów' });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(7);
    expect(screen.getByText(/Level 45/)).toBeTruthy();
    expect(screen.getByText('najlepszy')).toBeTruthy();
  });

  it('clicking a build in the ranking opens its talent trees in the Builds tab', async () => {
    const { rerender } = render(<ForeverApp view="sim" runner={runner} />);
    fireEvent.click(screen.getByRole('button', { name: 'Uruchom symulację' }));
    const table = await screen.findByRole('table', { name: 'Ranking buildów' });
    const link = [...table.querySelectorAll('tbody a')].at(-1) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('#/forever/builds');
    const id = link.textContent as string;
    fireEvent.click(link);
    rerender(<ForeverApp view="builds" runner={runner} />);
    expect((screen.getByLabelText('Build') as HTMLSelectElement).value).toBe(id);
    expect(screen.getByRole('region', { name: 'Drzewo Affliction' })).toBeTruthy();
  });

  it('shows an error when the run fails', async () => {
    const failing: JobRunner = () => Promise.reject(new Error('boom'));
    render(<ForeverApp view="sim" runner={failing} />);
    fireEvent.click(screen.getByRole('button', { name: 'Uruchom symulację' }));
    expect((await screen.findByRole('alert')).textContent).toContain('boom');
  });

  it('compares two builds and draws the level curve', async () => {
    render(<ForeverApp view="compare" runner={runner} />);
    fireEvent.click(screen.getByRole('button', { name: 'Porównaj' }));
    await waitFor(() => expect(screen.getByRole('table', { name: 'Porównanie buildów' })).toBeTruthy());
    expect(screen.getByRole('img', { name: /zabicia na godzinę/i })).toBeTruthy();
  });

  it('lists builds, rotations and assumptions', () => {
    const { unmount } = render(<ForeverApp view="builds" runner={runner} />);
    expect(screen.getByRole('table', { name: 'Talenty' })).toBeTruthy();
    for (const t of ['Affliction', 'Demonology', 'Destruction']) expect(screen.getByRole('region', { name: `Drzewo ${t}` })).toBeTruthy();
    expect(screen.getAllByRole('img', { name: /^Improved Shadow Bolt: \d\/5$/ })).toHaveLength(1);
    unmount();
    render(<ForeverApp view="rotations" runner={runner} />);
    expect(screen.getByText(/Affliction \(DoT-y/)).toBeTruthy();
    expect(screen.queryByText(/Demonology \(Shadow Bolt/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Build/), { target: { value: 'DEMO_PACT_R1' } });
    expect(screen.getByText(/Demonology \(Shadow Bolt/)).toBeTruthy();
    expect(screen.getByText('Shadow Bolt (ranga 1)')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Build/), { target: { value: 'AFF_WRACK' } });
    expect(document.querySelectorAll('.fv-flow .fv-icon').length).toBeGreaterThan(8);
    expect(document.querySelector('.fv-flow img[src*="spell_shadow_shadowbolt"]')).toBeTruthy();
    cleanup();
    render(<ForeverApp view="assumptions" runner={runner} />);
    expect(screen.getByRole('table', { name: 'Założenia do weryfikacji' })).toBeTruthy();
  });
});
