import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goTo, renderApp } from '../renderApp';

// Render counters for the shell's memoized parts: each is replaced by a memoized wrapper that
// counts its renders and draws the real component (same props, same memo comparison).
const counts = vi.hoisted(() => ({ Header: 0, StatusChips: 0 }));

vi.mock('../../../src/ui/shell/Header', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/ui/shell/Header')>();
  const { memo, createElement } = await import('react');
  return {
    ...actual,
    Header: memo(function CountedHeader(props: Parameters<typeof actual.Header>[0]) {
      counts.Header += 1;
      return createElement(actual.Header, props);
    }),
  };
});

vi.mock('../../../src/ui/shell/StatusChips', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/ui/shell/StatusChips')>();
  const { memo, createElement } = await import('react');
  return {
    ...actual,
    StatusChips: memo(function CountedChips(props: Parameters<typeof actual.StatusChips>[0]) {
      counts.StatusChips += 1;
      return createElement(actual.StatusChips, props);
    }),
  };
});

const FAKE_NOW = 1_800_000_000_000;
type CountsHost = { __RENDER_COUNTS__?: Record<string, number> };
const renderCounts = () => (globalThis as CountsHost).__RENDER_COUNTS__ ?? {};

beforeEach(() => {
  vi.useFakeTimers({
    now: FAKE_NOW,
    toFake: ['Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'],
  });
  (globalThis as CountsHost).__RENDER_COUNTS__ = {};
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

/** One animation frame of the fake clock (requestAnimationFrame fires every 16 ms). */
function frame() {
  act(() => {
    vi.advanceTimersByTime(16);
  });
}

describe('Fight screen: render budget', () => {
  it('60 frames of a running fight re-render the header, the status chips and Setup 0 times and the meter at most 15 times', () => {
    renderApp({ route: '#/fight' });
    fireEvent.keyDown(window, { key: '1' }); // the pull: Shadow Bolt
    frame();
    expect(counts.Header).toBeGreaterThan(0); // the counters are wired (the mount rendered them)
    expect(counts.StatusChips).toBeGreaterThan(0);
    counts.Header = 0;
    counts.StatusChips = 0;
    (globalThis as CountsHost).__RENDER_COUNTS__ = {};
    const before = performance.now();
    for (let i = 0; i < 60; i++) frame();
    expect(performance.now() - before).toBe(960);
    expect(counts.Header).toBe(0);
    expect(counts.StatusChips).toBe(0);
    // No Setup component is on the Fight screen at all.
    expect(document.querySelector('.setup, .gear, .talents')).toBeNull();
    const meter = renderCounts().MiniMeter ?? 0;
    expect(meter).toBeGreaterThan(0); // it does update (4 times a second of fight time)
    expect(meter).toBeLessThanOrEqual(15);
  });
});

/** Lets the lazy views' imports settle. */
async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.dynamicImportSettled();
    });
  }
}
function resetCounts() {
  counts.Header = 0;
  counts.StatusChips = 0;
  (globalThis as CountsHost).__RENDER_COUNTS__ = {};
}

describe('Setup and Report: render budget (spec §10: only Fight components render per frame)', () => {
  it('Setup: with a fight left running (it pauses), 60 frames re-render the header, the chips, the rail, the section and the summary 0 times', async () => {
    renderApp({ route: '#/fight' });
    fireEvent.keyDown(window, { key: '1' });
    frame();
    goTo('#/setup/gear');
    await settle();
    // The counters are wired: the Setup screen's parts rendered when it opened.
    for (const name of ['SetupRail', 'SetupSection', 'SummaryAside']) expect(renderCounts()[name] ?? 0, name).toBeGreaterThan(0);
    resetCounts();
    for (let i = 0; i < 60; i++) frame();
    expect(counts.Header).toBe(0);
    expect(counts.StatusChips).toBe(0);
    for (const name of ['SetupRail', 'SetupSection', 'SummaryAside', 'MiniMeter']) expect(renderCounts()[name] ?? 0, name).toBe(0);
  });

  it("Report: a simulation's progress re-renders the header, the report's header and its tabs 0 times (only the Simulator tab)", async () => {
    renderApp({ route: '#/fight' });
    fireEvent.keyDown(window, { key: '1' });
    act(() => {
      vi.advanceTimersByTime(61_000); // the fight ends: the Report has a fight
    });
    goTo('#/report/simulator');
    await settle();
    for (const name of ['ReportHead', 'ReportTabs']) expect(renderCounts()[name] ?? 0, name).toBeGreaterThan(0);
    resetCounts();
    const panel = screen.getByRole('region', { name: 'Simulator' });
    fireEvent.change(within(panel).getByRole('spinbutton', { name: 'Runs' }), { target: { value: '300' } });
    fireEvent.blur(within(panel).getByRole('spinbutton', { name: 'Runs' }));
    fireEvent.change(within(panel).getByRole('spinbutton', { name: 'Seed' }), { target: { value: '5' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Run 300 Fights' }));
    for (let i = 0; i < 2000 && within(panel).queryByRole('button', { name: 'Cancel' }) !== null; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
    }
    expect(within(panel).queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(within(panel).getByRole('region', { name: 'Simulation result' })).toBeTruthy();
    expect(renderCounts().SimulatorTab ?? 0).toBeGreaterThan(2); // the progress did render (the tab)
    expect(counts.Header).toBe(0);
    expect(counts.StatusChips).toBe(0);
    expect(renderCounts().ReportHead ?? 0).toBe(0);
    expect(renderCounts().ReportTabs ?? 0).toBe(0);
  });
});
