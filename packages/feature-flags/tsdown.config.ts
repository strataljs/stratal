import { defineConfig } from 'tsdown'
import { baseConfig, withTypesExports } from '../../tsdown.base.ts'

export default defineConfig({
  ...baseConfig,
  entry: [
    'src/index.ts',
    'src/react.ts',
  ],
  tsconfig: './tsconfig.build.json',
  exports: {
    customExports: (exports) => withTypesExports(exports),
  },
  deps: {
    skipNodeModulesBundle: true,
    neverBundle: [/^cloudflare:/],
  },
})
