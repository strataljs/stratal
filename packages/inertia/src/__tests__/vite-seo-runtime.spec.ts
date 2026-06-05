import { describe, expect, it } from 'vitest'
import type { Plugin } from 'vite'
import { stratalInertia } from '../vite'

type TransformFn = (code: string, id: string) => { code: string; map: null } | null

function injector(plugins: Plugin[]): { transform: TransformFn } {
  const plugin = plugins.find((p) => p.name === 'stratal:inertia-inject-seo-runtime')
  if (!plugin) throw new Error('seo-runtime injector plugin not found')
  return { transform: plugin.transform as unknown as TransformFn }
}

const RUNTIME = "import '@stratal/inertia/seo-runtime';"

describe('stratalInertia seo-runtime injection', () => {
  // The transform hook is invoked identically by the Vite dev server (per
  // served module) and the production build (during bundling), so these cover
  // both modes.
  it('prepends the runtime import to the default client entry', () => {
    const { transform } = injector(stratalInertia())
    const result = transform('export default 1', '/project/src/inertia/app.tsx')

    expect(result?.code).toContain(RUNTIME)
    expect(result?.code).toContain('export default 1')
  })

  it('ignores non-entry modules', () => {
    const { transform } = injector(stratalInertia())
    expect(transform('whatever', '/project/src/pages/Home.tsx')).toBeNull()
  })

  it('strips query strings before matching (dev server appends them)', () => {
    const { transform } = injector(stratalInertia())
    expect(transform('x', '/project/src/inertia/app.tsx?t=123')?.code).toContain(RUNTIME)
  })

  it('does not double-inject', () => {
    const { transform } = injector(stratalInertia())
    const once = transform('code', '/project/src/inertia/app.tsx')!.code
    expect(transform(once, '/project/src/inertia/app.tsx')).toBeNull()
  })

  it('honours custom entries', () => {
    const { transform } = injector(stratalInertia({ entries: ['/src/client/main.tsx'] }))
    expect(transform('c', '/project/src/client/main.tsx')?.code).toContain(RUNTIME)
    expect(transform('c', '/project/src/inertia/app.tsx')).toBeNull()
  })
})
