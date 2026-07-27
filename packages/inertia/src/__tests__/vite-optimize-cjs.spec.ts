import { describe, expect, it } from 'vitest'
import type { EnvironmentOptions, Plugin } from 'vite'
import { stratalInertia } from '../vite'

function optimizeDepsPlugin(plugins: Plugin[]): Plugin {
  const plugin = plugins.find((p) => p.name === 'stratal:optimize-deps-fix')
  if (!plugin) throw new Error('optimize-deps-fix plugin not found')
  return plugin
}

function configureEnv(plugin: Plugin, env: EnvironmentOptions): EnvironmentOptions {
  const fn = plugin.configEnvironment as unknown as (
    this: void,
    name: string,
    env: EnvironmentOptions,
  ) => void
  fn.call(undefined, 'worker', env)
  return env
}

describe('stratalInertia optimizeDeps include', () => {
  // `@zenstackhq/orm` and `@react-email/render` are installed in this monorepo
  // (framework/core depend on them), so both resolve and must be force-included.
  it('force-includes resolvable optional CJS packages alongside react-dom/server', () => {
    const env: EnvironmentOptions = {}
    configureEnv(optimizeDepsPlugin(stratalInertia()), env)

    expect(env.optimizeDeps?.include).toContain('react-dom/server')
    expect(env.optimizeDeps?.include).toContain('@zenstackhq/orm')
    expect(env.optimizeDeps?.include).toContain('@react-email/render')
  })

  it('preserves an existing include list', () => {
    const env: EnvironmentOptions = { optimizeDeps: { include: ['some-app-dep'] } }
    configureEnv(optimizeDepsPlugin(stratalInertia()), env)

    expect(env.optimizeDeps?.include).toContain('some-app-dep')
    expect(env.optimizeDeps?.include).toContain('@zenstackhq/orm')
  })
})
