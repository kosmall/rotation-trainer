import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Tokens and fonts first: every later stylesheet (the shell's, the legacy game.css) uses them.
import './ui/theme/fonts';
import './ui/theme/tokens.css';
import { App } from './ui/App';
import './ui/game.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
