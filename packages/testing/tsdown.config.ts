import { defineConfig } from 'tsdown'
import { baseConfig, withTypesExports } from '../../tsdown.base.ts'

export default defineConfig({
  ...baseConfig,
  entry: [
    'src/index.ts',
    'src/feature-flags/index.ts',
    'src/mocks/index.ts',
    'src/mocks/zenstack-language.ts',
    'src/storage/index.ts',
    'src/vitest-plugin/index.ts',
  ],
  tsconfig: './tsconfig.build.json',
  exports: {
    customExports: withTypesExports,
  },
  deps: {
    skipNodeModulesBundle: true,
    neverBundle: [/^cloudflare:/],
  },
})
