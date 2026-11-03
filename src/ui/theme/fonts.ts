// The self-hosted fonts (UI redesign spec §4.3; SIL OFL 1.1): Marcellus (display), Barlow (UI
// text) and Barlow Semi Condensed (numbers, keys, timers, combat text). Latin subsets only; each
// import is an @font-face with `font-display: swap`, so a browser fetches a file only when a
// rule uses that weight. Isolated here (spec Q5): dropping these imports falls back to the
// system stacks in tokens.css.

import '@fontsource/marcellus/latin-400.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-semi-condensed/latin-500.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/barlow-semi-condensed/latin-700.css';
import '@fontsource/barlow-semi-condensed/latin-800.css';
import '@fontsource/barlow-semi-condensed/latin-800-italic.css';
