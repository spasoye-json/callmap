import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/cli/test-browser/readme-screenshots.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
