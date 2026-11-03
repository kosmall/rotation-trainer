import { AppShell } from './shell/AppShell';
import { TrainerProvider } from './state/TrainerProvider';

/** The app: the trainer's state (setup, fight, item database) under the hash-routed shell. */
export function App() {
  return (
    <TrainerProvider>
      <AppShell />
    </TrainerProvider>
  );
}
