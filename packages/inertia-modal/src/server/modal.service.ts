import type { Page } from '@inertiajs/core'
import {
  INERTIA_TOKENS,
  type DocumentRendererService,
  type InertiaPartialRequest,
  type InertiaPropResolution,
  type InertiaService,
  type SeoData,
  type SeoService,
} from '@stratal/inertia'
import { Request as RequestScoped, inject } from 'stratal/di'
import type { RouterContext } from 'stratal/router'

import { resolveCloseTarget } from '../core/close-target'
import { anchorPropMetadata, levelAskFor, levelPropNames, type LevelAsk } from '../core/level-props'
import {
  decodeHeldLevels,
  MODAL_BENEATH_PROP,
  MODAL_HELD_HEADER,
  MODAL_MARKER_HEADER,
  MODAL_PROP,
  type ModalData,
} from '../core/wire'
import { ModalBackground } from './background'

export interface ModalRenderOptions {
  /** What sits beneath this level: a page route, or another modal route. */
  base: string
}

/** The page-object keys `anchorPropMetadata` rewrites, in the shape a page carries them. */
type PageMetadata = Pick<
  Page,
  'mergeProps' | 'prependProps' | 'deepMergeProps' | 'matchPropsOn' | 'scrollProps' | 'deferredProps' | 'onceProps'
>

@RequestScoped()
export class ModalService {
  constructor(
    @inject(INERTIA_TOKENS.DocumentRenderer) private readonly documentRenderer: DocumentRendererService,
    @inject(INERTIA_TOKENS.InertiaService) private readonly inertia: InertiaService,
    @inject(INERTIA_TOKENS.SeoService) private readonly seo: SeoService,
    // Named explicitly so the class stays a VALUE import: a type-only one leaves the DI container
    // with no token for this parameter.
    @inject(ModalBackground) private readonly background: ModalBackground,
  ) {}

  async render(
    ctx: RouterContext,
    component: string,
    props: Record<string, unknown>,
    options: ModalRenderOptions,
  ): Promise<Response> {
    const isInertia = ctx.header('x-inertia') === 'true'
    const requestURL = new URL(ctx.c.req.url)
    const referer = ctx.header('referer') ?? null

    const close = resolveCloseTarget({
      referer,
      base: options.base,
      requestURL: ctx.c.req.url,
      origin: requestURL.origin,
      held: decodeHeldLevels(ctx.header(MODAL_HELD_HEADER) ?? null),
    })

    const ask = this.askedOf(ctx, referer, requestURL)
    // Nothing asked, nothing resolved — and so nothing advertised either. A level whose props the
    // client already holds contributes no metadata, which is what stops its outstanding `defer()`
    // props being announced again on every reload the page around it makes.
    const resolution = ask.kind === 'unchanged'
      ? EMPTY_RESOLUTION
      : await this.inertia.resolveProps(
        props,
        this.levelRequest(this.inertia.partialRequestFor(ctx, component, isInertia), ask),
      )

    const modal: ModalData = {
      component,
      props: resolution.resolvedProps,
      url: `${requestURL.pathname}${requestURL.search}`,
      base: options.base,
      close,
    }

    const anchored = anchorPropMetadata(metadataOf(resolution)) as PageMetadata
    const seoProp = this.seo.contributed() ? { seo: await this.seo.resolve(ctx) } : {}

    // This request's own flash, on both paths. A submission that redirects into a modal route
    // flashes a result for the sheet to show, and it is read once — so dropping it here loses it
    // outright rather than deferring it. `errors` rides in the same bag and is lifted into props,
    // where `preserveState: 'errors'` resolves it.
    const { flash, errors } = this.flashFrom(ctx)

    // The whole rule. An Inertia visit has a page mounted to graft onto; a document request does
    // not, and is the only case that has to rebuild what sits beneath.
    if (isInertia) {
      return this.json({
        component,
        // An unchanged level is not sent. Inertia merges a partial response onto the props the
        // client holds, so omitting the level leaves the one it is looking at exactly as it was —
        // which is what `unchanged` claims. Sending it with no props instead states the opposite:
        // that the level now has none. A client that took that literally would render the sheet
        // with nothing in it, and no later response would put the props back.
        props: { ...(ask.kind === 'unchanged' ? {} : { [MODAL_PROP]: modal }), errors, ...seoProp },
        url: modal.url,
        version: null,
        flash,
        rememberedState: {},
        rescuedProps: [],
        ...anchored,
      })
    }

    const chain = await this.background.chainFor(ctx, options.base)

    // page.url is the modal's, so Inertia's initial visit keeps the address bar on the modal and the
    // SSR and hydration passes agree on it.
    const page: Page = {
      ...chain.page,
      props: {
        ...chain.page.props,
        errors,
        [MODAL_PROP]: modal,
        [MODAL_BENEATH_PROP]: chain.levels,
      },
      url: modal.url,
      flash,
      // The page beneath keeps its own deferred and merge props; the level's are added to them.
      ...mergeMetadata(chain.page, anchored),
    }

    // The level is what the URL names, so its own `ctx.seo()` is this page's metadata. Only when it
    // named some: the page beneath carries its own, and resolving unconditionally would answer with
    // the module defaults and overwrite it.
    const seoTags = this.seo.contributed() ? this.applyLevelSeo(page, await this.seo.resolve(ctx)) : []

    return this.documentRenderer.render(page, 200, seoTags)
  }

  /**
   * The partial request as the level's own props see it.
   *
   * Inertia decides what to resolve by matching the request's names against the keys of the record
   * it is given, and the two are in different namespaces here: the names arrive page-anchored
   * (`modal.props.items`), while the record is the level's own props keyed bare (`items`). Passed
   * through untranslated, a partial reload names nothing that exists — every prop is skipped, a
   * deferred one is never resolved, and the level answers empty. `<Deferred>` reads that as the
   * prop still being missing and asks again, which is a loop that does not end.
   *
   * `isPartial` is taken from what the request names rather than from `request.isPartial`, which
   * is false for every level. Inertia decides that by comparing `X-Inertia-Partial-Component`
   * against the component being rendered, and the client sends the component of the page it holds
   * — the page beneath, since a level is grafted onto it as a prop, not swapped in for it. So the
   * comparison is between a page and a level and can never match. `narrowedTo` has already
   * established that this request is addressed to this level, by the referer, which is the signal
   * that actually means what `isPartial` is being asked here.
   *
   * `null` resolves the level whole, covering both of its readings: a request addressed elsewhere,
   * and one asking for the level itself.
   */
  private levelRequest(request: InertiaPartialRequest, ask: LevelAsk): InertiaPartialRequest {
    return {
      ...request,
      isPartial: ask.kind === 'props',
      requested: ask.kind === 'props' ? ask.names : [],
      except: levelPropNames(request.except),
      reset: levelPropNames(request.reset),
    }
  }

  /**
   * What this request asks of the level.
   *
   * Answering with anything but the whole level is only safe when the client is already looking at
   * it, because a narrowed answer is merged over the props it holds and an `unchanged` one carries
   * none at all. `Referer` is what says so: an XHR from inside the sheet reports the sheet's own
   * url, while a partial re-issued into a modal route by a redirect reports the page the request
   * started from. Its partial headers survive that redirect unchanged, so without this check such
   * a response would leave the level with holes nothing will ever fill.
   */
  private askedOf(ctx: RouterContext, referer: string | null, requestURL: URL): LevelAsk {
    if (referer === null) return { kind: 'whole' }

    let refererURL: URL
    try {
      refererURL = new URL(referer)
    }
    catch {
      return { kind: 'whole' }
    }

    if (refererURL.origin !== requestURL.origin || refererURL.pathname !== requestURL.pathname) {
      return { kind: 'whole' }
    }

    return levelAskFor(ctx.header('x-inertia-partial-data') ?? null)
  }

  /** Writes a level's resolved SEO onto the page and returns its head tags. */
  private applyLevelSeo(page: Page, resolved: SeoData): string[] {
    page.props.seo = resolved
    return this.seo.tagsFor(resolved)
  }

  /**
   * The validation errors this response carries.
   *
   * Load-bearing on this path rather than incidental: a failed submission redirects back into the
   * modal route, and `preserveState: 'errors'` resolves against the response — an empty record here
   * closes the sheet the user was filling in.
   */
  private flashFrom(
    ctx: RouterContext,
  ): { flash: Record<string, unknown>; errors: Page['props']['errors'] } {
    const raw = (ctx.c.get('inertiaFlash') as Record<string, unknown> | undefined) ?? {}
    const { errors: rawErrors, ...flash } = raw
    const errors = (rawErrors !== undefined && typeof rawErrors === 'object'
      && !Array.isArray(rawErrors) && rawErrors !== null)
      ? rawErrors as Page['props']['errors']
      : {}

    return { flash, errors }
  }

  private json(page: Page): Response {
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Inertia': 'true',
        [MODAL_MARKER_HEADER]: 'true',
        'Vary': 'X-Inertia',
      },
    })
  }
}

/** What a level contributes when the request asked nothing of it. */
const EMPTY_RESOLUTION: InertiaPropResolution = {
  resolvedProps: {},
  mergeProps: [],
  prependProps: [],
  deepMergeProps: [],
  matchPropsOn: [],
  scrollProps: {},
  deferredProps: {},
  onceProps: {},
}

/** A resolution's metadata in the shape a page object carries it. */
function metadataOf(resolution: InertiaPropResolution): Record<string, unknown> {
  return {
    ...(resolution.mergeProps.length > 0 ? { mergeProps: resolution.mergeProps } : {}),
    ...(resolution.prependProps.length > 0 ? { prependProps: resolution.prependProps } : {}),
    ...(resolution.deepMergeProps.length > 0 ? { deepMergeProps: resolution.deepMergeProps } : {}),
    ...(resolution.matchPropsOn.length > 0 ? { matchPropsOn: resolution.matchPropsOn } : {}),
    ...(Object.keys(resolution.scrollProps).length > 0 ? { scrollProps: resolution.scrollProps } : {}),
    ...(Object.keys(resolution.deferredProps).length > 0 ? { deferredProps: resolution.deferredProps } : {}),
    ...(Object.keys(resolution.onceProps).length > 0 ? { onceProps: resolution.onceProps } : {}),
  }
}

/** The page's own metadata with the level's anchored metadata added to it. */
function mergeMetadata(base: Page, anchored: PageMetadata): PageMetadata {
  const deferredProps: NonNullable<Page['deferredProps']> = { ...base.deferredProps }
  for (const [group, names] of Object.entries(anchored.deferredProps ?? {})) {
    deferredProps[group] = [...(deferredProps[group] ?? []), ...names]
  }

  const mergeProps = [...(base.mergeProps ?? []), ...(anchored.mergeProps ?? [])]
  const prependProps = [...(base.prependProps ?? []), ...(anchored.prependProps ?? [])]
  const deepMergeProps = [...(base.deepMergeProps ?? []), ...(anchored.deepMergeProps ?? [])]
  const matchPropsOn = [...(base.matchPropsOn ?? []), ...(anchored.matchPropsOn ?? [])]
  const scrollProps = { ...base.scrollProps, ...anchored.scrollProps }
  const onceProps = { ...base.onceProps, ...anchored.onceProps }

  return {
    ...(mergeProps.length > 0 ? { mergeProps } : {}),
    ...(prependProps.length > 0 ? { prependProps } : {}),
    ...(deepMergeProps.length > 0 ? { deepMergeProps } : {}),
    ...(matchPropsOn.length > 0 ? { matchPropsOn } : {}),
    ...(Object.keys(scrollProps).length > 0 ? { scrollProps } : {}),
    ...(Object.keys(deferredProps).length > 0 ? { deferredProps } : {}),
    ...(Object.keys(onceProps).length > 0 ? { onceProps } : {}),
  }
}
