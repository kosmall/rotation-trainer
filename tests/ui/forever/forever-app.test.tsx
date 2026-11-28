import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { runJob, type JobRequest } from '../../../src/forever/web/api';
import { CUSTOM_STORAGE_KEY } from '../../../src/forever/web/custom';
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
    expect(parseRoute('#/forever/ep')).toEqual({ mode: 'forever', view: 'ep' });
    expect(routeHref({ mode: 'forever', view: 'ep' })).toBe('#/forever/ep');
  });
});

describe('ForeverApp', () => {
  it('runs the ranking for the chosen level and shows the results', async () => {
    render(<ForeverApp view="sim" runner={runner} />);
    fireEvent.change(screen.getByLabelText('Level postaci (liczba)'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uruchom symulację' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tabela' }));
    const table = screen.getByRole('table', { name: 'Ranking buildów' });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(22);
    expect(screen.getByText(/Level 45/)).toBeTruthy();
    expect(within(table).getByText('najlepszy')).toBeTruthy();
  });

  it('lets the level be typed digit by digit (A5-007): 4 then 5 gives 45, not a clamped 10 then 105', () => {
    render(<ForeverApp view="sim" runner={runner} />);
    const input = screen.getByLabelText('Level postaci (liczba)') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '4' } });
    expect(input.value).toBe('4');
    fireEvent.change(input, { target: { value: '45' } });
    expect(input.value).toBe('45');
    expect(screen.getByText('45', { selector: 'b' })).toBeTruthy();
    fireEvent.blur(input);
    expect(input.value).toBe('45');
  });

  it('clamps an out-of-range level on blur or Enter and never stores an invalid one', () => {
    render(<ForeverApp view="sim" runner={runner} />);
    const input = screen.getByLabelText('Level postaci (liczba)') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99' } });
    expect(input.value).toBe('99');
    expect(screen.getByText(/Level postaci:/, { selector: 'label' }).textContent).not.toContain('99');
    fireEvent.blur(input);
    expect(input.value).toBe('59');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('10');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input.value).toBe('10');
  });

  it('lets the session count be typed digit by digit (100, not 500) and follows the slider', () => {
    const { container } = render(<ForeverApp view="sim" runner={runner} />);
    const sessions = screen.getByLabelText('Sesje') as HTMLInputElement;
    for (const v of ['1', '10', '100']) {
      fireEvent.change(sessions, { target: { value: v } });
      expect(sessions.value).toBe(v);
    }
    fireEvent.blur(sessions);
    expect(sessions.value).toBe('100');
    const level = screen.getByLabelText('Level postaci (liczba)') as HTMLInputElement;
    fireEvent.change(level, { target: { value: '4' } });
    fireEvent.change(container.querySelector('input[type="range"]') as HTMLInputElement, { target: { value: '30' } });
    expect(level.value).toBe('30');
  });

  it('clicking a build in the ranking opens its talent trees in the Builds tab', async () => {
    const { rerender } = render(<ForeverApp view="sim" runner={runner} />);
    fireEvent.click(screen.getByRole('button', { name: 'Uruchom symulację' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tabela' }));
    const table = screen.getByRole('table', { name: 'Ranking buildów' });
    const link = [...table.querySelectorAll('tbody a')].at(-1) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('#/forever/builds');
    const id = link.textContent as string;
    fireEvent.click(link);
    rerender(<ForeverApp view="builds" runner={runner} />);
    expect((screen.getByLabelText('Build') as HTMLSelectElement).value).toBe(id);
    expect(screen.getByRole('region', { name: 'Drzewo Affliction' })).toBeTruthy();
  });

  it('a button on a build in the Builds tab opens its rotation in the Rotations tab', () => {
    const { rerender } = render(<ForeverApp view="builds" runner={runner} />);
    const select = () => screen.getByLabelText('Build') as HTMLSelectElement;
    const open = (id: string) => {
      rerender(<ForeverApp view="builds" runner={runner} />);
      fireEvent.change(select(), { target: { value: id } });
      const link = screen.getByRole('link', { name: 'Pokaż rotację' });
      expect(link.getAttribute('href')).toBe('#/forever/rotations');
      fireEvent.click(link);
      rerender(<ForeverApp view="rotations" runner={runner} />);
    };
    open('DT_SS_NOCOE');
    expect(select().value).toBe('DT_SS_NOCOE');
    expect(screen.getByRole('list', { name: 'Diagram rotacji DT_SS_NOCOE' })).toBeTruthy();
    // the button wins over an earlier choice made in the Rotations tab
    fireEvent.change(select(), { target: { value: 'AFF_WRACK' } });
    open('DEMO_FIRE');
    expect(select().value).toBe('DEMO_FIRE');
    expect(screen.getByRole('list', { name: 'Diagram rotacji DEMO_FIRE' })).toBeTruthy();
  });

  it('own builds are folded away, with the number of those in the ranking', () => {
    const build = (name: string) => ({ name, picks: ['suppression'], rotation: 'affliction', filler: 'drain_life', rank: 'max', pet: 'voidwalker', sacrificed: null });
    window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify({ builds: [build('A'), build('B')], active: 'A', included: ['A'] }));
    render(<ForeverApp view="sim" runner={runner} />);
    const summary = screen.getByText('Własne buildy w rankingu (1 z 2)');
    expect(summary.closest('details')!.open).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'B (1/51)', hidden: true }));
    expect(screen.getByText('Własne buildy w rankingu (2 z 2)')).toBeTruthy();
  });

  it('marks Eureka! in the rotation diagram before the spells of the chosen timing', () => {
    const marks = () => document.querySelectorAll('.fv-flow .fv-eureka');
    const { unmount } = render(<ForeverApp view="rotations" runner={runner} />);
    // off: the recommended place, dimmed
    expect(marks().length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.fv-flow .fv-eureka-off')).toHaveLength(marks().length);
    expect(screen.getByText(/Eureka! jest wyłączona w ustawieniach/)).toBeTruthy();
    unmount();
    window.localStorage.setItem('wow-forever-sim:settings:v1', JSON.stringify({ eureka: 'filler' }));
    const second = render(<ForeverApp view="rotations" runner={runner} />);
    // AFF_WRACK: the filler row (Wrack), not dimmed
    expect(marks()).toHaveLength(1);
    expect(document.querySelectorAll('.fv-flow .fv-eureka-off')).toHaveLength(0);
    second.unmount();
    window.localStorage.setItem('wow-forever-sim:settings:v1', JSON.stringify({ eureka: 'pull_start' }));
    render(<ForeverApp view="rotations" runner={runner} />);
    expect(marks()).toHaveLength(0);
    expect(screen.getByText('Eureka! na starcie pulla')).toBeTruthy();
  });

  it('draws the rotation from its JSON and offers that JSON', () => {
    render(<ForeverApp view="rotations" runner={runner} />);
    const pre = screen.getByLabelText('JSON rotacji AFF_WRACK');
    const spec = JSON.parse(pre.textContent ?? '');
    expect(spec.schema).toBe('forever-rotation/1');
    expect(spec.build).toBe('AFF_WRACK');
    // every step of the JSON is a row of the diagram, in the same order
    const rows = [...document.querySelectorAll('.fv-flow [data-step]')].map((r) => r.getAttribute('data-step'));
    expect(rows).toEqual(['life_tap', ...spec.steps.map((s: { id: string }) => s.id)]);
    const link = screen.getByRole('link', { name: 'Pobierz JSON' });
    expect(link.getAttribute('download')).toBe('AFF_WRACK.rotation.json');
    // numbers are written out: no vague wording
    expect(screen.getAllByText(/cel pożyje co najmniej 6 s/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/dość długo/)).toBeNull();
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
    expect(screen.getByRole('figure', { name: /Zabić\/h wg levelu/ })).toBeTruthy();
    expect(screen.getByRole('figure', { name: /Różnica A − B/ })).toBeTruthy();
  });

  it('lists the facts of a build one per row, with icons', () => {
    window.localStorage.setItem('wow-forever-sim:settings:v1', JSON.stringify({ level: 59 }));
    render(<ForeverApp view="builds" runner={runner} />);
    fireEvent.change(screen.getByLabelText('Build'), { target: { value: 'AFF_WRACK' } });
    const facts = document.querySelector('.fv-facts-icons') as HTMLElement;
    const rows = new Map([...facts.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling as HTMLElement]));
    expect([...rows.keys()]).toEqual(['Rotacja', 'Pet', 'Shadow Bolt', 'Filler', 'Talenty', 'Punkty na levelu 59', 'Affliction', 'Demonology', 'Destruction', 'Ostatni punkt', 'Następny punkt']);
    // the text next to the icons (an icon tile carries the name's initials)
    const text = (name: string) => rows.get(name)?.lastElementChild?.textContent;
    expect(text('Rotacja')).toBe('Affliction (DoT-y + filler)');
    expect(text('Shadow Bolt')).toBe('najwyższa ranga');
    expect(text('Filler')).toBe('Wrack');
    expect(text('Punkty na levelu 59')).toBe('50');
    expect(text('Affliction')).toBe('46');
    expect(text('Ostatni punkt')).toBe('Demonic Embrace');
    for (const name of ['Rotacja', 'Pet', 'Shadow Bolt', 'Filler', 'Affliction', 'Demonology', 'Destruction', 'Ostatni punkt', 'Następny punkt']) expect(rows.get(name)?.querySelector('.fv-icon img'), name as string).toBeTruthy();
  });

  it('names the demon that stands in until the own demon of the build is learned', () => {
    window.localStorage.setItem('wow-forever-sim:settings:v1', JSON.stringify({ level: 10 }));
    render(<ForeverApp view="builds" runner={runner} />);
    fireEvent.change(screen.getByLabelText('Build'), { target: { value: 'DEMO_PACT_R1' } });
    expect(screen.getByText('Succubus, poświęcony: Imp; na levelu 10 jeszcze niedostępny, walczy Voidwalker')).toBeTruthy();
  });

  it('names the demon a pet rule picks for the pull size', () => {
    window.localStorage.setItem('wow-forever-sim:settings:v1', JSON.stringify({ level: 30, mobs: 2 }));
    render(<ForeverApp view="builds" runner={runner} />);
    fireEvent.change(screen.getByLabelText('Build'), { target: { value: 'DEMO_PACT_R1_PET' } });
    expect(screen.getByText(/zamiast niego: Voidwalker przy 3\+ mobach, Voidwalker przy 2 mobach; na levelu 30 przy 2 mobach, walczy Voidwalker/)).toBeTruthy();
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
    expect(screen.getAllByText('Shadow Bolt (ranga 1)').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/Build/), { target: { value: 'AFF_WRACK' } });
    expect(document.querySelectorAll('.fv-flow .fv-icon').length).toBeGreaterThan(8);
    expect(document.querySelector('.fv-flow img[src*="spell_shadow_shadowbolt"]')).toBeTruthy();
    cleanup();
    render(<ForeverApp view="assumptions" runner={runner} />);
    expect(screen.getByRole('table', { name: 'Założenia do weryfikacji' })).toBeTruthy();
  });
});

describe('ForeverApp EP tab', () => {
  it('computes EP for the build of the Builds tab and shows its column', async () => {
    render(<ForeverApp view="ep" runner={runner} />);
    expect(screen.getByRole('button', { name: 'Uruchom (użyj Policz EP)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Policz EP' }));
    const table = await screen.findByRole('table', { name: 'Wagi statów (EP)' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['stat', 'AFF_WRACK']);
  });

  it('hands a picked custom build to the job (the worker cannot read the browser storage)', async () => {
    window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify({ builds: [{ name: 'Mój', picks: ['suppression', 'suppression'], rotation: 'affliction', filler: 'wrack', rank: 'max', pet: 'voidwalker', sacrificed: null }], active: 'Mój', included: [] }));
    const seen: JobRequest[] = [];
    const spy: JobRunner = (req, o) => {
      seen.push(req);
      return runner(req, o);
    };
    render(<ForeverApp view="ep" runner={spy} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '★ Mój' }));
    fireEvent.click(screen.getByRole('button', { name: 'Policz EP' }));
    await screen.findByRole('table', { name: 'Wagi statów (EP)' });
    const req = seen[0];
    expect(req?.kind).toBe('ep');
    expect(req?.kind === 'ep' && req.custom?.map((c) => c.name)).toEqual(['Mój']);
  });
});
