import { defineConfig } from 'vitest/config';

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages project site. Dev server stays at the root; preview serves the built base.
  base: command === 'serve' && !isPreview ? '/' : '/bluewater-prototype/',
  server: {
    host: '127.0.0.1',
    port: 8734,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 8735,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
  },
}));
