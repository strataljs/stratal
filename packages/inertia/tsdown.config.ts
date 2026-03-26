import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'
import { baseConfig, withTypesExports } from '../../tsdown.base.ts'

export default defineConfig({
  ...baseConfig,
  entry: [
    'src/index.ts',
    'src/vite.ts',
    'src/react.ts',
    'src/testing.ts',
  ],
  tsconfig: './tsconfig.build.json',
  exports: {
    customExports: withTypesExports,
  },
  deps: {
    skipNodeModulesBundle: true,
    neverBundle: [/^cloudflare:/],
  },
  hooks: {
    'build:done': () => {
      const typeRef = '/// <reference path="../global.d.ts" />'
      for (const dtsPath of ['dist/index.d.mts', 'dist/vite.d.mts', 'dist/react.d.mts']) {
        const content = readFileSync(dtsPath, 'utf8')
        if (!content.startsWith(typeRef)) {
          writeFileSync(dtsPath, `${typeRef}\n${content}`)
        }
      }
    },
  },
})
