import { act, render } from '@testing-library/react';
import { AppShell } from '../../src/ui/shell/AppShell';
import { TrainerProvider } from '../../src/ui/state/TrainerProvider';
import type { TrainerProviderProps } from '../../src/ui/state/TrainerProvider';

export interface RenderAppOptions extends TrainerProviderProps {
  /** The hash the app opens at (default `#/fight`). */
  route?: string;
}

/**
 * Renders the whole app (provider + shell) at `route`. The setup storage defaults to `null`
 * (memory only) so no test reads or writes the real localStorage; the UI preferences
 * (`rotation-trainer:ui:v1`) use the same storage, as in the app.
 */
export function renderApp({ route = '#/fight', storage = null, ...providerProps }: RenderAppOptions = {}) {
  window.location.hash = route;
  return render(
    <TrainerProvider storage={storage} {...providerProps}>
      <AppShell />
    </TrainerProvider>,
  );
}

/** Moves to `hash` as a link or the address bar would (the router listens to `hashchange`). */
export function goTo(hash: string): void {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}
