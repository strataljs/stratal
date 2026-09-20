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
          // The type-generator specs drive ts-morph over real `.d.ts` graphs
          // resolved from `node_modules`. That work is CPU-bound, so its wall
          // time is set by how much CPU the runner can spare rather than by the
          // size of the assertion — a test that finishes in under a second on an
          // idle machine can exceed the 5 s default on a cold, contended one.
          // This budget absorbs that variance while still failing a genuinely
          // hung test quickly.
          testTimeout: 30_000,
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
          server: {
            deps: {
              // Inertia's page store and `<App>`'s "router already initialised"
              // flag are module-level singletons. Externalised deps survive
              // `vi.resetModules()`, so a spec that mounts more than one page
              // would silently keep the first one; inlining them makes the reset
              // real and each test independent.
              inline: ['@inertiajs/core', '@inertiajs/react'],
            },
          },
        },
      },
    ],
  },
})
