// A development-only render counter: the render budget tests (tests/ui/fight/render-budget.test.tsx)
// and profiling runs read `globalThis.__RENDER_COUNTS__`. A production build drops the body
// (`import.meta.env.DEV` is false there), so it costs nothing in the app.

type CountsHost = { __RENDER_COUNTS__?: Record<string, number> };

/** Counts a render of `name` in `globalThis.__RENDER_COUNTS__` (development and tests only). */
export function countRender(name: string): void {
  if (!import.meta.env.DEV) return;
  const host = globalThis as CountsHost;
  const counts = (host.__RENDER_COUNTS__ ??= {});
  counts[name] = (counts[name] ?? 0) + 1;
}
