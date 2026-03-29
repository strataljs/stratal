import { defineConfig } from 'tsdown';
import { baseConfig, withTypesExports } from '../../tsdown.base.ts';

export default defineConfig([
  {
    ...baseConfig,
    entry: ['src/index.ts', 'src/*/index.ts', 'src/i18n/messages/en/index.ts', 'src/i18n/validation/index.ts', 'src/storage/providers/index.ts', 'src/i18n/utils/index.ts'],
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
  },
  {
    ...baseConfig,
    entry: ['src/bin/quarry.ts', 'src/bin/cloudflare-workers-loader.ts'],
    outDir: 'dist/bin',
    tsconfig: './tsconfig.build.json',
    dts: false,
    clean: false,
    banner: { js: '#!/usr/bin/env -S node --no-warnings' },
    deps: {
      skipNodeModulesBundle: true,
      neverBundle: [/^cloudflare:/, 'stratal', /^stratal\//],
    },
  },
])
