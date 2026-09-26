import { defineConfig } from 'vitest/config';

// Standalone config so unit tests don't load the CRX/React plugins from vite.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
