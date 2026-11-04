import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FightView } from '../fight/FightView';
import { useTrainer } from '../state/TrainerProvider';
import { useTheme } from '../theme/theme';
import { Header } from './Header';
import { MODE_HREFS, parseRoute, routeTitle, useRoute } from './router';
import type { Mode, Route } from './router';
import { useGlobalShortcuts } from './shortcuts';
import { ShortcutsDialog } from './ShortcutsDialog';
import { TabBar } from './TabBar';
import './shell.css';

// Setup and Report load on first visit; the Fight (the first screen) is in the main bundle.
const SetupPlaceholder = lazy(() => import('./PlaceholderViews').then((m) => ({ default: m.SetupPlaceholder })));
const ReportPlaceholder = lazy(() => import('./PlaceholderViews').then((m) => ({ default: m.ReportPlaceholder })));

function View({ route }: { route: Route }) {
  switch (route.mode) {
    case 'setup':
      return <SetupPlaceholder section={route.section} />;
    case 'report':
      return <ReportPlaceholder tab={route.tab} />;
    default:
      return <FightView />;
  }
}

/**
 * The app shell (UI redesign spec §3): skip link, header, the current mode's view in `<main>`, the
 * mobile tab bar and the global shortcuts. Owns the route (`useRoute`); a mode change moves focus
 * to `<main>` (without scrolling) and every route sets `document.title`.
 */
export function AppShell() {
  const [route, navigate] = useRoute();
  const { meta } = useTrainer();
  const { theme, toggle } = useTheme(meta.uiStorage);
  const mainRef = useRef<HTMLElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const title = routeTitle(route);
  useEffect(() => {
    document.title = title;
  }, [title]);

  // Class tokens (`--class`, `--resource`) follow the spec's class.
  const classId = meta.spec.classId;
  useLayoutEffect(() => {
    document.documentElement.dataset.class = classId;
  }, [classId]);

  // Focus to <main> when the mode changes (not on the first render: the page keeps its own focus).
  const lastMode = useRef<Mode>(route.mode);
  useEffect(() => {
    if (lastMode.current === route.mode) return;
    lastMode.current = route.mode;
    mainRef.current?.focus({ preventScroll: true });
  }, [route.mode]);

  const goTo = useCallback((mode: Mode) => navigate(parseRoute(MODE_HREFS[mode])), [navigate]);
  const openHelp = useCallback(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setHelpOpen(true);
  }, []);
  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    const back = returnFocusRef.current;
    returnFocusRef.current = null;
    if (back?.isConnected) back.focus();
  }, []);
  // Off while a fight runs (every key is the fight's then); a paused fight (the screen was left) does not count.
  useGlobalShortcuts({ enabled: (meta.phase !== 'running' || meta.paused) && !helpOpen, goTo, openHelp });

  return (
    <>
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          // Not a hash change: "#main" is not a route.
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>
      <Header mode={route.mode} spec={meta.spec} labels={meta.labels} pending={meta.pending} theme={theme} onToggleTheme={toggle} />
      <main id="main" ref={mainRef} tabIndex={-1} className={`shell-main mode-${route.mode}`}>
        <Suspense
          fallback={
            <p className="view-loading" aria-live="polite">
              Loading…
            </p>
          }
        >
          <View route={route} />
        </Suspense>
      </main>
      <TabBar mode={route.mode} />
      {helpOpen && <ShortcutsDialog onClose={closeHelp} />}
    </>
  );
}
