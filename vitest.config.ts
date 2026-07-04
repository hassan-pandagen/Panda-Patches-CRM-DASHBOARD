import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Test runner config. Pure-logic tests run in node-like jsdom; component tests
// (if added) get the DOM + jest-dom matchers via the setup file.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});
