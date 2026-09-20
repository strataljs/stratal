import type { ConfigEnv, UserConfig } from 'vite'
import type { TestUserConfig } from 'vitest/config'
import { describe, expect, it } from 'vitest'
import { createStratalPlugin } from '../stratal-test.js'

type StratalUserConfig = UserConfig & { test?: TestUserConfig }

const configEnv: ConfigEnv = { command: 'serve', mode: 'test' }

/**
 * Invokes the plugin's `config` hook with the given incoming config.
 *
 * Vite plugin hooks may be a bare function or an object with a `handler`
 * (e.g. to also declare `order`), so this normalises before calling rather
 * than assuming the bare-function shape.
 */
async function runConfigHook(databaseEnabled: boolean, incoming: StratalUserConfig) {
  const plugin = createStratalPlugin(databaseEnabled)
  const hook = plugin.config
  if (!hook) throw new Error('stratal-test plugin has no config hook')
  const rawHandler = typeof hook === 'function' ? hook : hook.handler
  // Strip the hook's `this: ConfigPluginContext` parameter — the plugin never
  // reads `this`, and `OmitThisParameter` lets it be called plainly instead
  // of hand-building a fake plugin context.
  const handler: OmitThisParameter<typeof rawHandler> = rawHandler
  // The hook's return type allows a Promise (other plugins' `config` hooks can
  // be async); awaiting collapses it to the resolved config for assertions.
  return await handler(incoming, configEnv)
}

describe('createStratalPlugin', () => {
  describe('database enabled', () => {
    it('leaves an explicit hookTimeout on the incoming project config untouched', async () => {
      const result = await runConfigHook(true, { test: { hookTimeout: 120_000 } })
      expect(result?.test?.hookTimeout).toBe(120_000)
    })

    it('defaults hookTimeout to 30s when the incoming project config sets nothing', async () => {
      const result = await runConfigHook(true, {})
      expect(result?.test?.hookTimeout).toBe(30_000)
    })

    it('leaves an explicit fileParallelism on the incoming project config untouched', async () => {
      const result = await runConfigHook(true, { test: { fileParallelism: false } })
      expect(result?.test?.fileParallelism).toBe(false)
    })

    it('defaults fileParallelism to true when the incoming project config sets nothing', async () => {
      const result = await runConfigHook(true, {})
      expect(result?.test?.fileParallelism).toBe(true)
    })

    it('refuses isolate: false, since a shared isolate would share a leased database', async () => {
      await expect(runConfigHook(true, { test: { isolate: false } })).rejects.toThrow(/needs `isolate: true`/)
    })

    it('sets isolate to true when the incoming project config sets nothing', async () => {
      const result = await runConfigHook(true, {})
      expect(result?.test?.isolate).toBe(true)
    })

    it('does not disturb resolve.alias or ssr.noExternal when the incoming config overrides all three defaults', async () => {
      const result = await runConfigHook(true, {
        test: { hookTimeout: 120_000, fileParallelism: false, isolate: true },
      })
      expect(result?.resolve?.alias).toMatchObject({
        tslib: 'tslib/tslib.es6.mjs',
        '@zenstackhq/language': '@stratal/testing/mocks/zenstack-language',
      })
      expect(result?.ssr?.noExternal).toEqual(['@zenstackhq/better-auth'])
    })

    it('does not disturb resolve.alias or ssr.noExternal when the incoming config sets nothing', async () => {
      const result = await runConfigHook(true, {})
      expect(result?.resolve?.alias).toMatchObject({
        tslib: 'tslib/tslib.es6.mjs',
        '@zenstackhq/language': '@stratal/testing/mocks/zenstack-language',
      })
      expect(result?.ssr?.noExternal).toEqual(['@zenstackhq/better-auth'])
    })
  })

  describe('database disabled', () => {
    it('sets no test block at all, regardless of what the incoming config declares', async () => {
      const result = await runConfigHook(false, { test: { hookTimeout: 120_000 } })
      expect(result?.test).toBeUndefined()
    })

    it('still returns the resolve.alias and ssr.noExternal defaults', async () => {
      const result = await runConfigHook(false, {})
      expect(result?.resolve?.alias).toMatchObject({
        tslib: 'tslib/tslib.es6.mjs',
        '@zenstackhq/language': '@stratal/testing/mocks/zenstack-language',
      })
      expect(result?.ssr?.noExternal).toEqual(['@zenstackhq/better-auth'])
    })
  })
})
