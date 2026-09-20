import { Module } from 'stratal/module'
import { Controller, Get, type RouterContext } from 'stratal/router'
import { afterEach, describe, expect, it } from 'vitest'
import { Test } from '../test'
import type { TestingModule } from '../testing-module'

@Controller('/posts', { name: 'posts.' })
class PostsController {
  @Get('/', { name: 'index' })
  index(ctx: RouterContext) {
    return ctx.json({ self: ctx.route('posts.index') })
  }
}

// Second controller under a distinct prefix, so an `exclude` entry can be
// asserted against one prefix while the other proves the mode is still on.
@Controller('/webhooks', { name: 'webhooks.' })
class WebhooksController {
  @Get('/', { name: 'index' })
  index(ctx: RouterContext) {
    return ctx.json({ self: ctx.route('webhooks.index') })
  }
}

@Module({ controllers: [PostsController, WebhooksController] })
class PostsModule { }

describe('TestingModuleConfig application config passthrough', () => {
  let module: TestingModule | null = null

  afterEach(async () => {
    await module?.close()
    module = null
  })

  describe('trailingSlash', () => {
    it("defaults to the framework default ('ignore') when omitted", async () => {
      module = await Test.createTestingModule({ imports: [PostsModule] }).compile()

      const bare = await module.http.get('/posts').send()
      bare.assertOk()
      await bare.assertJsonPath('self', '/posts')

      const slashed = await module.http.get('/posts/').send()
      slashed.assertOk()
    })

    it("canonicalises with a 308 when set to 'always'", async () => {
      module = await Test.createTestingModule({
        imports: [PostsModule],
        trailingSlash: 'always',
      }).compile()

      const bare = await module.http.get('/posts').send()
      bare.assertStatus(308)
      expect(bare.headers.get('Location')).toBe('/posts/')

      const slashed = await module.http.get('/posts/').send()
      slashed.assertOk()
      await slashed.assertJsonPath('self', '/posts/')
    })

    it('accepts the { mode, exclude } object and leaves an excluded prefix alone', async () => {
      module = await Test.createTestingModule({
        imports: [PostsModule],
        trailingSlash: { mode: 'always', exclude: ['/webhooks'] },
      }).compile()

      const excluded = await module.http.get('/webhooks').send()
      excluded.assertOk()
      await excluded.assertJsonPath('self', '/webhooks')

      // The mode still applies everywhere the exclusion does not reach.
      const canonicalised = await module.http.get('/posts').send()
      canonicalised.assertStatus(308)
      expect(canonicalised.headers.get('Location')).toBe('/posts/')
    })
  })

  describe('versioning', () => {
    it('registers routes unversioned when omitted', async () => {
      module = await Test.createTestingModule({ imports: [PostsModule] }).compile()

      const unversioned = await module.http.get('/posts').send()
      unversioned.assertOk()

      const versioned = await module.http.get('/v1/posts').send()
      versioned.assertNotFound()
    })

    it('applies the version prefix when configured', async () => {
      module = await Test.createTestingModule({
        imports: [PostsModule],
        versioning: { prefix: 'v', defaultVersion: '1' },
      }).compile()

      const versioned = await module.http.get('/v1/posts').send()
      versioned.assertOk()
      await versioned.assertJsonPath('self', '/v1/posts')

      const unversioned = await module.http.get('/posts').send()
      unversioned.assertNotFound()
    })
  })
})
