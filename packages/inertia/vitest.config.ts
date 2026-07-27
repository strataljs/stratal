import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // `stratal/cache` (loaded transitively in node specs) statically imports the
    // Workers-only `cloudflare:workers` built-in; alias it to a Node-loadable
    // stub. No miniflare project here, so applying it globally is safe.
    alias: { 'cloudflare:workers': '@stratal/testing/mocks/cloudflare-workers' },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/__tests__/**/*.spec.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/*.dom.spec.{ts,tsx}'],
          setupFiles: ['./vitest.setup.ts'],
          globals: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/__tests__/**/*.dom.spec.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          setupFiles: ['./vitest.setup.ts'],
          globals: true,
        },
      },
    ],
  },
})
