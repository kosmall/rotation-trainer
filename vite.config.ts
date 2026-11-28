import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths: the build works at a domain root and under a GitHub Pages sub-path (the router is hash based).
  base: './',
  plugins: [react()],
  test: {
    // Many tests run real simulations, and the CI runner is 2-3x slower than a developer machine: at the 5 s
    // default whichever crosses the line first fails the Pages deploy. A hung test still fails, just later.
    testTimeout: 30_000,
    // Only the UI tests need a DOM; everything else runs in plain Node (much faster to start).
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.{ts,tsx}'],
          exclude: ['tests/ui/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['tests/ui/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
