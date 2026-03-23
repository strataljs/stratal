import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'
import { baseConfig, withTypesExports } from '../../tsdown.base.ts'

export default defineConfig({
  ...baseConfig,
  entry: [
    'src/index.ts',
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
      const dtsPath = 'dist/index.d.mts'
      const content = readFileSync(dtsPath, 'utf8')
      writeFileSync(dtsPath, `/// <reference path="../global.d.ts" />\n${content}`)
    },
  },
})
