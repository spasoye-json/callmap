import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['packages/*/test/**/*.test.ts', 'test/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'app',
          include: ['packages/app/test/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['packages/app/test/setup.ts'],
          testTimeout: 60_000,
        },
      },
    ],
  },
});
