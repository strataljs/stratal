import type { Page } from '@inertiajs/core'
import { InertiaService, type DocumentRendererService, type InertiaModuleOptions, type SeoService } from '@stratal/inertia'
import { TestResponse } from '@stratal/testing'
import type { RouterContext } from 'stratal/router'
import { describe, expect, it, vi } from 'vitest'
import { MODAL_MARKER_HEADER, type ModalData } from '../../core/wire'
import { ModalBackground, type ModalBackgroundDispatcher } from '../../server/background'
import { ModalService } from '../../server/modal.service'
import '../../testing'

/**
 * Every response asserted here comes out of the real `ModalService`, never a payload written by
 * hand. A helper that agrees with a fixture the service can never emit is the defect these helpers
 * exist to prevent, so the fixture is the service.
 */

function createCtx(url: string, headers: Record<string, string> = {}): RouterContext {
  const header = (name: string) => headers[name.toLowerCase()]
  const store = new Map<string, unknown>([['inertia', true]])
  return {
    header,
    c: {
      req: { url, header },
      env: {},
      executionCtx: {},
      get: (key: string) => store.get(key),
      set: (key: string, value: unknown) => store.set(key, value),
    },
  } as unknown as RouterContext
}

function pageBody(component: string): string {
  return JSON.stringify({
    component,
    props: { errors: {} },
    url: '/parent',
    version: null,
    flash: {},
    rememberedState: {},
    rescuedProps: [],
  } satisfies Page)
}

function modalBody(level: ModalData): string {
  return JSON.stringify({ props: { modal: level } })
}

function dispatcher(routes: Record<string, () => Response>): ModalBackgroundDispatcher {
  return {
    fetch(request) {
      const answer = routes[new URL(request.url).pathname]
      if (answer === undefined) throw new Error(`no route for ${request.url}`)
      return Promise.resolve(answer())
    },
  }
}

const ROUTES: Record<string, () => Response> = {
  '/parent': () => new Response(pageBody('Parent/Index'), { status: 200 }),
  '/parent/42': () => new Response(
    modalBody({
      component: 'Parent/Show',
      props: { item: { id: '42' } },
      url: '/parent/42',
      base: '/parent',
      close: '/parent',
    }),
    { status: 200, headers: { [MODAL_MARKER_HEADER]: 'true' } },
  ),
}

function createService() {
  const documentRenderer = { render: vi.fn().mockResolvedValue(new Response('<html>document</html>', { status: 200 })) }
  const options: InertiaModuleOptions = { rootView: '<html>@inertia</html>' }
  const seo = {
    contributed: () => false,
    resolve: vi.fn().mockResolvedValue({}),
    tagsFor: vi.fn().mockReturnValue([]),
  } as unknown as SeoService
  const inertia = new InertiaService(options, documentRenderer as unknown as DocumentRendererService, seo)
  const service = new ModalService(
    documentRenderer as unknown as DocumentRendererService,
    inertia,
    seo,
    new ModalBackground(dispatcher(ROUTES)),
  )

  return { service, inertia, documentRenderer }
}

/**
 * The document response for one level opened over a page.
 *
 * Read off the page handed to the document renderer, because that is where a document response
 * carries the chain and a `TestResponse` over the rendered HTML could not see it.
 */
async function oneLevel(): Promise<TestResponse> {
  const { service, documentRenderer } = createService()
  await service.render(
    createCtx('https://app.test/parent/42/edit'),
    'Parent/Edit',
    { item: { id: '42' }, tab: 'details' },
    { base: '/parent' },
  )
  const [page] = documentRenderer.render.mock.calls[0] as [Page]
  return new TestResponse(new Response(JSON.stringify(page), { status: 200 }))
}

/** Two levels: this one opens over a route that is itself a modal. */
async function twoLevels(): Promise<TestResponse> {
  const { service, documentRenderer } = createService()
  await service.render(
    createCtx('https://app.test/parent/42/edit'),
    'Parent/Edit',
    { item: { id: '42' } },
    { base: '/parent/42' },
  )
  const [page] = documentRenderer.render.mock.calls[0] as [Page]
  return new TestResponse(new Response(JSON.stringify(page), { status: 200 }))
}

/** The level alone, which is what every Inertia visit answers with. */
async function levelOnly(): Promise<TestResponse> {
  const { service } = createService()
  return new TestResponse(await service.render(
    createCtx('https://app.test/parent/42/edit', { 'x-inertia': 'true' }),
    'Parent/Edit',
    { item: { id: '42' }, tab: 'details' },
    { base: '/parent/42' },
  ))
}

/** A page that never opened a modal, rendered by the real InertiaService. */
async function noModal(): Promise<TestResponse> {
  const { inertia } = createService()
  return new TestResponse(await inertia.render(
    createCtx('https://app.test/parent', { 'x-inertia': 'true' }),
    'Parent/Index',
    { email: 'someone@test' },
  ))
}

describe('TestResponse modal augmentation', () => {
  describe('assertModal()', () => {
    it('passes for a response that opened a modal, and hands over the level it rendered', async () => {
      let seen: ModalData | undefined
      await (await oneLevel()).assertModal((level) => { seen = level })

      expect(seen?.component).toBe('Parent/Edit')
    })

    it('hands over the level the response rendered, not the one beneath it', async () => {
      let seen: ModalData | undefined
      await (await twoLevels()).assertModal((level) => { seen = level })

      expect(seen?.component).toBe('Parent/Edit')
      expect(seen?.url).toBe('/parent/42/edit')
    })

    it('fails on a page that opened no modal', async () => {
      await expect((await noModal()).assertModal()).rejects.toThrow('Expected a modal to be open')
    })
  })

  describe('assertNoModal()', () => {
    it('passes for a page that opened no modal', async () => {
      await (await noModal()).assertNoModal()
    })

    it('fails when a modal is open', async () => {
      await expect((await oneLevel()).assertNoModal()).rejects.toThrow('Parent/Edit')
    })
  })

  describe('assertModalComponent()', () => {
    it('names the level the response rendered by default', async () => {
      await (await twoLevels()).assertModalComponent('Parent/Edit')
    })

    it('names a level by depth, 0 being outermost', async () => {
      const response = await twoLevels()
      await response.assertModalComponent('Parent/Show', 0)
      await response.assertModalComponent('Parent/Edit', 1)
    })

    it('resolves the level of a response that carries it alone', async () => {
      await (await levelOnly()).assertModalComponent('Parent/Edit')
    })

    it('fails on the wrong component', async () => {
      await expect((await oneLevel()).assertModalComponent('Parent/Show'))
        .rejects.toThrow('Expected the modal to be "Parent/Show", got "Parent/Edit"')
    })

    it('fails on a depth the response does not carry', async () => {
      await expect((await oneLevel()).assertModalComponent('Parent/Edit', 1))
        .rejects.toThrow('Expected a modal level at depth 1, but the response carries 1')
    })

    it('says why a depth is unreachable when the response carries only the level', async () => {
      await expect((await levelOnly()).assertModalComponent('Parent/Edit', 0))
        .rejects.toThrow('carries only the level it rendered')
    })
  })

  describe('assertModalBase()', () => {
    it('names what the level sits over', async () => {
      await (await oneLevel()).assertModalBase('/parent')
    })

    it('reads the level a visit carries alone', async () => {
      await (await levelOnly()).assertModalBase('/parent/42')
    })

    it('fails on the wrong base, and says what it found', async () => {
      await expect((await oneLevel()).assertModalBase('/elsewhere')).rejects.toThrow('/parent')
    })
  })

  describe('assertModalClose()', () => {
    // Where closing lands is the one thing about a level that no other assertion covers, and a
    // wrong one is invisible until someone taps Close and does not arrive.
    it('names where closing the level lands', async () => {
      await (await oneLevel()).assertModalClose('/parent')
    })

    it('names a level by depth, as the other assertions do', async () => {
      await (await twoLevels()).assertModalClose('/parent/42', 1)
    })

    it('fails on the wrong close target, and says what it found', async () => {
      await expect((await oneLevel()).assertModalClose('/elsewhere')).rejects.toThrow('/parent')
    })
  })

  describe('assertModalComponents()', () => {
    it('names the whole chain, outermost first', async () => {
      await (await twoLevels()).assertModalComponents(['Parent/Show', 'Parent/Edit'])
    })

    it('asserts how many are open as well as which', async () => {
      await expect((await twoLevels()).assertModalComponents(['Parent/Edit']))
        .rejects.toThrow(/Expected the open modals to be \["Parent\/Edit"\]/)
    })

    it('rejects the order reversed', async () => {
      await expect((await twoLevels()).assertModalComponents(['Parent/Edit', 'Parent/Show']))
        .rejects.toThrow(/outermost first/)
    })

    it('cannot answer for a response that carries the level alone', async () => {
      await expect((await levelOnly()).assertModalComponents(['Parent/Edit']))
        .rejects.toThrow('carries only the level it rendered')
    })
  })

  describe('assertModalCount()', () => {
    it('counts one level opened over a page', async () => {
      await (await oneLevel()).assertModalCount(1)
    })

    it('counts a level stacked on another', async () => {
      await (await twoLevels()).assertModalCount(2)
    })

    it('fails on the wrong count', async () => {
      await expect((await twoLevels()).assertModalCount(1))
        .rejects.toThrow('Expected 1 modal level(s) open, got 2')
    })

    it('refuses to guess when the response carries the level alone', async () => {
      // The count is genuinely unknown here — the client holds the rest — so a silent `1` would let
      // this pass over a chain of three.
      await expect((await levelOnly()).assertModalCount(1))
        .rejects.toThrow('does not say how many levels are open')
    })
  })

  describe('assertModalDepth()', () => {
    it('reports 0 for a level opened over a page', async () => {
      await (await oneLevel()).assertModalDepth(0)
    })

    it('reports the depth a stacked level occupies', async () => {
      await (await twoLevels()).assertModalDepth(1)
    })

    it('fails on the wrong depth', async () => {
      await expect((await oneLevel()).assertModalDepth(1))
        .rejects.toThrow('Expected the modal to be at depth 1, got 0')
    })
  })

  describe('assertModalProp()', () => {
    it('reads a prop of the level the response rendered', async () => {
      await (await oneLevel()).assertModalProp('tab', 'details')
    })

    it('reads a nested dot-path', async () => {
      await (await oneLevel()).assertModalProp('item.id', '42')
    })

    it('reads a prop of a level named by depth', async () => {
      await (await twoLevels()).assertModalProp('item.id', '42', 0)
    })

    it('reads a prop of a response that carries the level alone', async () => {
      await (await levelOnly()).assertModalProp('tab', 'details')
    })

    it('fails on the wrong value', async () => {
      await expect((await oneLevel()).assertModalProp('tab', 'billing'))
        .rejects.toThrow('Expected prop "tab" of the modal to be "billing", got "details"')
    })
  })

  describe('assertModalOnly()', () => {
    it('passes for the response an Inertia visit gets', async () => {
      await (await levelOnly()).assertModalOnly()
    })

    it('fails when the response assembled the chain beneath the level', async () => {
      await expect((await twoLevels()).assertModalOnly())
        .rejects.toThrow('it assembled the chain beneath it')
    })
  })

  describe('modalLevel() / modalLevels()', () => {
    it('reads a level back whole, so any predicate can run against it', async () => {
      const level = await (await oneLevel()).modalLevel<{ item: { id: string } }>()

      expect(level.component).toBe('Parent/Edit')
      expect(level.props.item.id).toBe('42')
      // `base` is what sits beneath, and comparing it as a URL rather than a string keeps the
      // assertion off trailing-slash canonicalisation.
      expect(new URL(level.base, 'https://app.test').pathname).toBe('/parent')
    })

    it('reads a level back by depth', async () => {
      const level = await (await twoLevels()).modalLevel(0)

      expect(level.component).toBe('Parent/Show')
      expect(level.close).toBe('/parent')
    })

    it('reads the whole chain back, outermost first', async () => {
      const levels = await (await twoLevels()).modalLevels()

      expect(levels.map((level) => level.url)).toEqual(['/parent/42', '/parent/42/edit'])
    })

    it('reads back the one level an Inertia visit carries', async () => {
      const level = await (await levelOnly()).modalLevel()

      expect(level.close).toBe('/parent/42')
    })

    it('cannot read a chain the response does not carry', async () => {
      await expect((await levelOnly()).modalLevels()).rejects.toThrow('carries only the level it rendered')
    })

    it('two responses can be read back and compared', async () => {
      // The pattern a paginated sheet needs: the same level off two responses.
      const [first, second] = await Promise.all([oneLevel(), oneLevel()])

      expect((await first.modalLevel()).component).toBe((await second.modalLevel()).component)
    })
  })

  it('chains, like the Inertia assertions it sits beside', async () => {
    const response = await twoLevels()

    await (await (await response.assertModalCount(2)).assertModalComponent('Parent/Edit')).assertModalDepth(1)
  })
})
