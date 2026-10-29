import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
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
