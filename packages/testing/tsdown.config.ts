import { defineConfig } from 'tsdown'
import { baseConfig, withTypesExports } from '../../tsdown.base'

export default defineConfig({
  ...baseConfig,
  entry: [
    'src/index.ts',
    'src/mocks/index.ts',
    'src/mocks/nodemailer.ts',
    'src/mocks/zenstack-language.ts',
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
