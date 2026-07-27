import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'unit',
    environment: 'node',
    include: ['src/**/__tests__/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
  },
})
