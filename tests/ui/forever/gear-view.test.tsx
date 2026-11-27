import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import i253981 from '../../forever/fixtures/items/253981.json';
import i7057 from '../../forever/fixtures/items/7057.json';
import i280766 from '../../forever/fixtures/items/280766.json';
import { runJob } from '../../../src/forever/web/api';
import type { JobRunner } from '../../../src/forever/web/client';
import { ForeverApp } from '../../../src/ui/forever/ForeverApp';

const runner: JobRunner = async (req, o) => runJob({ ...req, settings: { ...req.settings, sessions: 5 } } as typeof req, o?.onProgress);
const FIX: Record<number, unknown> = { 253981: i253981, 7057: i7057, 280766: i280766 };
const fetcher = async (id: number): Promise<unknown> => {
  if (id === 999) throw new Error('offline');
  return FIX[id] ?? { error: 'Entity not found' };
};
const PAYLOAD = { class: 'warlock', level: 33, name: 'Feliczita', spec: 'affliction', talents: '245212200300013', gear: { items: [{ id: 253981 }, null, { id: 7057 }, null, null, null, null, null, null, null, null, null, { id: 280766 }, null, null, null, { id: 999 }] } };

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const importPayload = async (p: object = PAYLOAD) => {
  await screen.findByText(/Punkty:/);
  fireEvent.change(screen.getByLabelText('Build jako JSON'), { target: { value: JSON.stringify(p) } });
  fireEvent.click(screen.getByRole('button', { name: 'Importuj jako nowy' }));
};
const options = () => within(screen.getByLabelText('Sprzęt') as HTMLSelectElement).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);

describe('my gear', () => {
  it('offers no "mój sprzęt" until items are imported', async () => {
    render(<ForeverApp view="custom" runner={runner} itemFetcher={fetcher} />);
    await screen.findByText(/Punkty:/);
    expect(options()).toEqual(['quest', 'average', 'good']);
  });

  it('imports the items with the build, lists them and adds the option', async () => {
    render(<ForeverApp view="custom" runner={runner} itemFetcher={fetcher} />);
    await importPayload();
    const list = await screen.findByRole('table', { name: 'Moje itemy' });
    expect(within(list).getByText('Filigreed Shadow Circlet')).toBeTruthy();
    expect(within(list).getByText('Green Silken Shoulders')).toBeTruthy();
    expect(within(list).getByText(/offline/)).toBeTruthy(); // the item that failed stays listed
    expect(within(list).getByText(/Use: Reach into the bag/)).toBeTruthy();
    expect(screen.getByText(/Suma:/).textContent).toMatch(/Stamina 12/);
    expect(options()).toEqual(['quest', 'average', 'good', 'mine']);
  });

  it('simulates with my gear', async () => {
    render(<ForeverApp view="custom" runner={runner} itemFetcher={fetcher} />);
    await importPayload();
    await screen.findByRole('table', { name: 'Moje itemy' });
    fireEvent.change(screen.getByLabelText('Sprzęt'), { target: { value: 'mine' } });
    fireEvent.click(screen.getByRole('button', { name: /Sprawdź na levelu/ }));
    const table = await screen.findByRole('table', { name: 'Ranking buildów' });
    await waitFor(() => expect(table.querySelectorAll('tbody tr').length).toBeGreaterThan(1));
  });

  it('removing my gear brings back the average profile', async () => {
    render(<ForeverApp view="custom" runner={runner} itemFetcher={fetcher} />);
    await importPayload();
    await screen.findByRole('table', { name: 'Moje itemy' });
    fireEvent.change(screen.getByLabelText('Sprzęt'), { target: { value: 'mine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usuń mój sprzęt' }));
    await waitFor(() => expect(options()).toEqual(['quest', 'average', 'good']));
    expect((screen.getByLabelText('Sprzęt') as HTMLSelectElement).value).toBe('average');
  });

  it('an export with no items changes nothing', async () => {
    render(<ForeverApp view="custom" runner={runner} itemFetcher={fetcher} />);
    await importPayload({ ...PAYLOAD, gear: { items: [null, null] } });
    await screen.findByText('25/51');
    expect(options()).toEqual(['quest', 'average', 'good']);
  });

  it('restores my gear after a reload', async () => {
    const first = render(<ForeverApp view="custom" runner={runner} itemFetcher={fetcher} />);
    await importPayload();
    await screen.findByRole('table', { name: 'Moje itemy' });
    first.unmount();
    render(<ForeverApp view="custom" runner={runner} itemFetcher={fetcher} />);
    await screen.findByRole('table', { name: 'Moje itemy' });
    expect(options()).toContain('mine');
  });
});
