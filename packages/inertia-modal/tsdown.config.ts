import { readdirSync, readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'
import { baseConfig, withTypesExports } from '../../tsdown.base.ts'

export default defineConfig({
  ...baseConfig,
  entry: [
    'src/index.ts',
    'src/react.tsx',
    'src/testing.ts',
  ],
  tsconfig: './tsconfig.build.json',
  exports: {
    customExports: withTypesExports,
  },
  deps: {
    neverBundle: true,
  },
  hooks: {
    // The `./testing` entry exists to merge assertions into `TestResponse`, and
    // that merge is an ambient block the DTS bundler emits only while the
    // augmentation module is reached by a bare import. Dropping that import
    // leaves a well-formed package whose test helpers no longer typecheck for
    // anyone outside this repo, and no in-repo check notices. Fail the build.
    'build:done': () => {
      const dts = readFileSync('dist/testing.d.mts', 'utf8')
      if (!dts.includes(`declare module '@stratal/testing'`)) {
        throw new Error(
          'dist/testing.d.mts lost the `declare module \'@stratal/testing\'` augmentation. '
          + 'Restore the bare `import \'./augment/test-response\'` in src/testing.ts.',
        )
      }

      // The `modal` page prop is typed by augmenting `@inertiajs/core`'s
      // `PageProps` once in `src/page-props.ts`, bare-imported from every entry
      // that must carry it. Same hazard as the assertion above, one level
      // indirect: `src/page-props.ts` is shared by two entries, so the DTS
      // bundler emits it as its own chunk rather than inlining it — each
      // entry's `.d.mts` merely `import`s the chunk's compiled `.mjs`. That
      // import has to stay a bare (non type-only) one, because only a bare
      // import makes the bundler load the chunk's sibling `.d.mts` — carrying
      // the ambient block along — for anyone who imports the entry. A
      // type-only import keeps every re-exported signature intact while
      // silently dropping that, so a consumer's `usePage().props.modal`
      // degrades to `unknown` with no in-repo check noticing.
      const augmentation = `declare module '@inertiajs/core'`
      // Shared by two entries, so the bundler may either inline it into each
      // entry's `.d.mts` or split it into its own chunk that both `import`
      // for its `.mjs` side effect — check both shapes rather than assume one.
      const chunk = readdirSync('dist').find((name) => /^page-props-.*\.d\.mts$/.test(name))
      const chunkImport = chunk?.replace(/\.d\.mts$/, '.mjs')
      if (chunk && !readFileSync(`dist/${chunk}`, 'utf8').includes(augmentation)) {
        throw new Error(
          `dist/${chunk} lost the ${augmentation} augmentation. Restore it in src/page-props.ts.`,
        )
      }

      const pagePropsEntries: Record<string, string> = { react: 'react.tsx', index: 'index.ts' }
      for (const [entry, source] of Object.entries(pagePropsEntries)) {
        const entryDts = readFileSync(`dist/${entry}.d.mts`, 'utf8')
        const inlined = entryDts.includes(augmentation)
        const reachesChunk = chunkImport !== undefined && entryDts.includes(`import "./${chunkImport}"`)
        if (!inlined && !reachesChunk) {
          throw new Error(
            `dist/${entry}.d.mts no longer carries the ${augmentation} augmentation, inlined or `
            + `via a bare import of the page-props chunk. Restore the bare \`import './page-props'\` `
            + `in src/${source}.`,
          )
        }
      }
    },
  },
})
