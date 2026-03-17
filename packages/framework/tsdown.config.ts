import { defineConfig } from 'tsdown'
import { baseConfig, withTypesExports } from '../../tsdown.base'

export default defineConfig({
  ...baseConfig,
  entry: [
    'src/index.ts',
    'src/auth/index.ts',
    'src/context/index.ts',
    'src/database/index.ts',
    'src/factory/index.ts',
    'src/guards/index.ts',
    'src/rbac/index.ts',
  ],
  tsconfig: './tsconfig.build.json',
  exports: {
    customExports: withTypesExports,
  },
  deps: { skipNodeModulesBundle: true },
})
