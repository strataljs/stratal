import { defineConfig } from 'tsdown'
import { baseConfig, withTypesExports } from '../../tsdown.base'

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  tsconfig: './tsconfig.build.json',
  exports: {
    customExports: withTypesExports,
  },
  deps: { skipNodeModulesBundle: true },
})
