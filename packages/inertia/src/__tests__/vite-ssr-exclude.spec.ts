import { describe, expect, it } from 'vitest'
import type { Plugin } from 'vite'
import { stratalInertia } from '../vite'

interface TransformContext {
  environment: { name: string }
  warn: (message: string) => void
}

type TransformFn = (this: TransformContext, code: string, id: string) =>
  | { code: string; map: null }
  | null

function excludePlugin(plugins: Plugin[]): Plugin {
  const plugin = plugins.find((p) => p.name === 'stratal:inertia-ssr-exclude')
  if (!plugin) throw new Error('ssr-exclude plugin not found')
  return plugin
}

/** Runs the transform and reports both what it emitted and anything it warned about. */
function runTransform(
  plugin: Plugin,
  env: string,
  code: string
): { code: string | null; warnings: string[] } {
  const warnings: string[] = []
  const fn = plugin.transform as unknown as TransformFn
  const result = fn.call(
    { environment: { name: env }, warn: (message: string) => warnings.push(message) },
    code,
    '/project/src/inertia/ssr.tsx'
  )

  return { code: result?.code ?? null, warnings }
}

function transformIn(plugin: Plugin, env: string, code: string): string | null {
  return runTransform(plugin, env, code).code
}

const PAGE_GLOB = "const pages = import.meta.glob('./pages/**/*.tsx')"

describe('stratalInertia ssrExclude', () => {
  it('is not registered when no exclusions are configured', () => {
    expect(stratalInertia().find((p) => p.name === 'stratal:inertia-ssr-exclude')).toBeUndefined()
    expect(stratalInertia({ ssrExclude: [] }).find((p) => p.name === 'stratal:inertia-ssr-exclude')).toBeUndefined()
  })

  it('appends negative patterns to the worker/SSR page glob', () => {
    const plugin = excludePlugin(stratalInertia({ ssrExclude: ['Admin/**', 'Reports/Heavy'] }))
    const out = transformIn(plugin, 'ssr', PAGE_GLOB)

    // Vite excludes glob matches via `!` patterns in the array-form argument.
    expect(out).toContain('import.meta.glob([')
    expect(out).toContain('!./pages/Admin/**')
    expect(out).toContain('!./pages/Reports/Heavy.tsx')
  })

  it('rewrites an option-bearing page glob while preserving its options', () => {
    const plugin = excludePlugin(stratalInertia({ ssrExclude: ['Admin/**'] }))
    const out = transformIn(plugin, 'ssr', "const pages = import.meta.glob('./pages/**/*.tsx', { eager: true })")

    expect(out).toContain('import.meta.glob([')
    expect(out).toContain('!./pages/Admin/**')
    expect(out).toContain('], { eager: true })')
  })

  it('preserves a non-eager options object on the page glob', () => {
    const plugin = excludePlugin(stratalInertia({ ssrExclude: ['Admin/**'] }))
    const out = transformIn(plugin, 'ssr', "const pages = import.meta.glob('./pages/**/*.tsx', { import: 'default' })")

    expect(out).toContain('!./pages/Admin/**')
    expect(out).toContain("], { import: 'default' })")
  })

  it('leaves the browser bundle untouched so excluded pages still hydrate', () => {
    const plugin = excludePlugin(stratalInertia({ ssrExclude: ['Admin/**'] }))
    expect(transformIn(plugin, 'client', PAGE_GLOB)).toBeNull()
  })

  it('does not touch modules without a page glob', () => {
    const plugin = excludePlugin(stratalInertia({ ssrExclude: ['Admin/**'] }))
    expect(transformIn(plugin, 'ssr', 'export const x = 1')).toBeNull()
  })

  it('appends each exclusion exactly once', () => {
    // The single-string rewrite emits an array, so running the two rewrites in the wrong order
    // has the second match the first's output and append everything twice. Harmless to Vite —
    // the same pattern excluded twice — but `toContain` cannot see it, so it needs its own case.
    const plugin = excludePlugin(stratalInertia({ ssrExclude: ['Admin/**'] }))
    const out = transformIn(plugin, 'ssr', PAGE_GLOB) ?? ''

    expect(out.match(/!\.\/pages\/Admin\/\*\*/g)).toHaveLength(1)
  })

  it('appends to an array-form page glob instead of ignoring it', () => {
    // Vite's documented way to write negative patterns. Before this was handled the regex matched
    // nothing here, so `ssrExclude` silently did nothing and every page stayed in the worker
    // bundle — the failure this case exists to prevent.
    const plugin = excludePlugin(stratalInertia({ ssrExclude: ['Admin/**'] }))
    const out = transformIn(
      plugin,
      'ssr',
      "const pages = import.meta.glob(['./pages/**/*.tsx', '!./pages/**/*.spec.tsx'])"
    )

    expect(out).toContain('!./pages/Admin/**')
    // The resolver's own exclusion survives — appending must not replace what was there.
    expect(out).toContain('!./pages/**/*.spec.tsx')
    expect(out).toContain('./pages/**/*.tsx')
  })

  it('handles array patterns containing brackets or parentheses', () => {
    // Both are valid Vite globs and both appear in real resolvers: `[A-Z]` as a character class,
    // `!(*.spec)` as an extglob. A regex that excluded `]` or `)` to find the array's end would
    // stop inside one of them, fail to match, and warn about a glob that was never wrong.
    const plugin = excludePlugin(stratalInertia({ ssrExclude: ['Admin/**'] }))

    const bracket = runTransform(plugin, 'ssr', "import.meta.glob(['./pages/**/[A-Z]*.tsx'])")
    expect(bracket.code).toContain('!./pages/Admin/**')
    expect(bracket.code).toContain('[A-Z]')
    expect(bracket.warnings).toEqual([])

    const extglob = runTransform(plugin, 'ssr', "import.meta.glob(['./pages/**/!(*.spec).tsx'])")
    expect(extglob.code).toContain('!./pages/Admin/**')
    expect(extglob.code).toContain('!(*.spec)')
    expect(extglob.warnings).toEqual([])
  })

  it('leaves an array glob alone when it names no pages', () => {
    const plugin = excludePlugin(stratalInertia({ ssrExclude: ['Admin/**'] }))
    const { code, warnings } = runTransform(
      plugin,
      'ssr',
      "import.meta.glob(['./components/**/*.tsx'])"
    )

    expect(code).toBeNull()
    expect(warnings).toEqual([])
  })

  it('preserves options on an array-form page glob', () => {
    const plugin = excludePlugin(stratalInertia({ ssrExclude: ['Admin/**'] }))
    const out = transformIn(
      plugin,
      'ssr',
      "const pages = import.meta.glob(['./pages/**/*.tsx'], { eager: false })"
    )

    expect(out).toContain('{ eager: false }')
    expect(out).toContain('!./pages/Admin/**')
  })

  it('warns when a page glob is present but cannot be rewritten', () => {
    // A shape the rewrite does not understand means no page was excluded from the worker bundle.
    // Silence there reads as success, so this is the one case that must be noisy.
    const plugin = excludePlugin(stratalInertia({ ssrExclude: ['Admin/**'] }))
    const { code, warnings } = runTransform(
      plugin,
      'ssr',
      'const pages = import.meta.glob(PAGES_PATTERN_FROM_A_VARIABLE + "pages")'
    )

    expect(code).toBeNull()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('ssrExclude')
    expect(warnings[0]).toContain('No pages were excluded')
  })

  it('stays quiet for modules that have no page glob at all', () => {
    // Only the SSR entry is expected to carry one; warning on every other module would train
    // the reader to ignore the warning that matters.
    const plugin = excludePlugin(stratalInertia({ ssrExclude: ['Admin/**'] }))
    const { warnings } = runTransform(plugin, 'ssr', "import.meta.glob('./components/**/*.tsx')")

    expect(warnings).toEqual([])
  })

  it('defines the runtime exclusion global with the same glob list', () => {
    const plugin = excludePlugin(stratalInertia({ ssrExclude: ['Admin/**'] }))
    const config: { define?: Record<string, string> } = {}
    ;(plugin.config as (this: void, c: typeof config) => void).call(undefined, config)

    expect(config.define?.['globalThis.__STRATAL_INERTIA_SSR_EXCLUDE__']).toBe('["Admin/**"]')
  })
})
