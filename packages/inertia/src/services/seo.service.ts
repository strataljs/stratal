import { Request, inject } from 'stratal/di'
import type { RouterContext } from 'stratal/router'
import type { InertiaModuleOptions, InertiaSeoOptions } from '../inertia.options'
import { INERTIA_TOKENS } from '../inertia.tokens'
import { buildSeoTags, descriptorToHtml } from '../seo/build-seo-tags'
import type { SeoData } from '../seo/types'
import type { HreflangService } from './hreflang.service'

/**
 * Request-scoped accumulator for page SEO metadata.
 *
 * Controllers (and middleware) call `ctx.seo()` to contribute metadata; at
 * render time {@link InertiaService} resolves it against the module-level
 * defaults and title template, shares the result as the `seo` prop, and injects
 * the rendered tags into `<head>`.
 */
@Request(INERTIA_TOKENS.SeoService)
export class SeoService {
  private accumulated: SeoData = {}

  constructor(
    @inject(INERTIA_TOKENS.Options) private readonly options: InertiaModuleOptions,
    @inject(INERTIA_TOKENS.HreflangService) private readonly hreflang: HreflangService,
  ) { }

  /** Merges the given metadata into the request's accumulated SEO data. */
  set(data: SeoData): void {
    this.accumulated = mergeSeo(this.accumulated, data)
  }

  /**
   * Resolves the final SEO data: module defaults (base) merged with the
   * request's accumulated data, then the title template applied. Resolver
   * functions for `defaults`/`titleTemplate` are awaited with the request `ctx`.
   * Locale-aware `hreflang` alternates are appended last so they ride the same
   * head injection and SPA reconciliation as the rest of the SEO tags.
   */
  async resolve(ctx: RouterContext): Promise<SeoData> {
    const seo: InertiaSeoOptions | undefined = this.options.seo

    const defaults = typeof seo?.defaults === 'function'
      ? await seo.defaults(ctx)
      : seo?.defaults ?? {}

    const resolved = mergeSeo(defaults, this.accumulated)

    const template = seo?.titleTemplate
    if (typeof template === 'function') {
      resolved.title = await template(resolved.title, ctx)
    } else if (typeof template === 'string' && this.accumulated.title != null) {
      // Only wrap a page-provided title; a bare default title is used as-is.
      // Use split/join rather than String.replace so every `%s` is substituted
      // and `$`-sequences in the title (`$&`, `$$`, …) are treated literally.
      resolved.title = template.split('%s').join(this.accumulated.title)
    }

    // Append hreflang alternates for the current URL after any user-set links so
    // user links keep their document order. Computed fresh per request — never
    // stored on `accumulated`.
    const hreflang = this.hreflang.buildLinks(new URL(ctx.c.req.url))
    if (hreflang.length > 0) {
      resolved.link = [...(resolved.link ?? []), ...hreflang]
    }

    return resolved
  }

  /** Renders resolved SEO data into a list of head-tag HTML strings. */
  tagsFor(resolved: SeoData): string[] {
    return buildSeoTags(resolved).map(descriptorToHtml)
  }
}

/** Merges `b` over `a`: `openGraph`/`twitter` shallow-merge, `meta`/`link` concat, scalars overwrite. */
function mergeSeo(a: SeoData, b: SeoData): SeoData {
  return {
    ...a,
    ...b,
    ...(a.openGraph || b.openGraph ? { openGraph: { ...a.openGraph, ...b.openGraph } } : {}),
    ...(a.twitter || b.twitter ? { twitter: { ...a.twitter, ...b.twitter } } : {}),
    ...(a.meta || b.meta ? { meta: [...(a.meta ?? []), ...(b.meta ?? [])] } : {}),
    ...(a.link || b.link ? { link: [...(a.link ?? []), ...(b.link ?? [])] } : {}),
  }
}
