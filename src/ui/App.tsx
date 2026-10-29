import { destructionWarlock } from '../data/classes/warlock/destruction';
import { GameView } from './GameView';

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>TBC Rotation Trainer</h1>
        <span className="app-spec">{destructionWarlock.name}</span>
      </header>
      <GameView spec={destructionWarlock} />
    </div>
  );
}
