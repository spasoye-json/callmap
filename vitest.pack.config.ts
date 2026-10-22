import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/cli/test-pack/**/*.test.ts'],
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
