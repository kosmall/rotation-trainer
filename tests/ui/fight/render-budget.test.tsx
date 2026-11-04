import { act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../renderApp';

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
