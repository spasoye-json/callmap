import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Relative asset paths, because the shell serves the bundle from its own origin and not from a
 * site root. The port is fixed, because the shell's dev URL names it.
 */
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
