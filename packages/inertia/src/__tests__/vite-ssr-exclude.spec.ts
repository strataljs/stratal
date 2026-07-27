import { describe, expect, it } from 'vitest'
import type { Plugin } from 'vite'
import { stratalInertia } from '../vite'

type TransformFn = (this: { environment: { name: string } }, code: string, id: string) =>
  | { code: string; map: null }
  | null

function excludePlugin(plugins: Plugin[]): Plugin {
  const plugin = plugins.find((p) => p.name === 'stratal:inertia-ssr-exclude')
  if (!plugin) throw new Error('ssr-exclude plugin not found')
  return plugin
}

function transformIn(plugin: Plugin, env: string, code: string): string | null {
  const fn = plugin.transform as unknown as TransformFn
  return fn.call({ environment: { name: env } }, code, '/project/src/inertia/ssr.tsx')?.code ?? null
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

  it('defines the runtime exclusion global with the same glob list', () => {
    const plugin = excludePlugin(stratalInertia({ ssrExclude: ['Admin/**'] }))
    const config: { define?: Record<string, string> } = {}
    ;(plugin.config as (this: void, c: typeof config) => void).call(undefined, config)

    expect(config.define?.['globalThis.__STRATAL_INERTIA_SSR_EXCLUDE__']).toBe('["Admin/**"]')
  })
})
