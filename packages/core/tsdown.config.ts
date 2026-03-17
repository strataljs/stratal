import { defineConfig } from 'tsdown';
import { baseConfig, withTypesExports } from '../../tsdown.base';

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts', 'src/*/index.ts', 'src/i18n/messages/en/index.ts', 'src/i18n/validation/index.ts'],
  tsconfig: './tsconfig.build.json',
  exports: {
    customExports(exports: Record<string, Record<string, unknown> | string>) {
      exports['./validation'] = exports['./i18n/validation']

      delete exports['./i18n/validation']

      return withTypesExports(exports)
    },
  },
  deps: {
    skipNodeModulesBundle: true,
    neverBundle: [/^cloudflare:/],
  },
})
