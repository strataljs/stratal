/**
 * Public SEO data model for `@stratal/inertia`.
 *
 * These types are framework-free (no DI, worker, or React imports) so the same
 * definitions can be shared by the server-side {@link import('../services/seo.service').SeoService}
 * and the client-side head-sync runtime.
 */

/** Open Graph metadata. Maps to `<meta property="og:*">` tags. */
export interface SeoOpenGraph {
  title?: string
  description?: string
  image?: string
  type?: string
  url?: string
  siteName?: string
}

/** Twitter card metadata. Maps to `<meta name="twitter:*">` tags. */
export interface SeoTwitter {
  card?: 'summary' | 'summary_large_image' | 'app' | 'player'
  title?: string
  description?: string
  image?: string
  site?: string
  creator?: string
}

/** A custom `<meta>` tag. Provide either `name` or `property` plus `content`. */
export interface SeoMetaTag {
  name?: string
  property?: string
  content: string
}

/** A custom `<link>` tag. `rel` and `href` are required; extra attributes are passed through. */
export type SeoLinkTag = { rel: string; href: string } & Record<string, string>

/**
 * SEO metadata for a page. Set per-request via `ctx.seo()` and/or as app-wide
 * defaults through {@link import('../inertia.options').InertiaSeoOptions}.
 */
export interface SeoData {
  /** Document title (`<title>`). Subject to the configured `titleTemplate`. */
  title?: string
  /** Meta description (`<meta name="description">`). */
  description?: string
  /** Canonical URL (`<link rel="canonical">`). */
  canonical?: string
  /** Robots directive (`<meta name="robots">`), e.g. `"noindex, nofollow"`. */
  robots?: string
  /** Keywords (`<meta name="keywords">`). Arrays are joined with `", "`. */
  keywords?: string | string[]
  /** Author (`<meta name="author">`). */
  author?: string
  /** Open Graph metadata. */
  openGraph?: SeoOpenGraph
  /** Twitter card metadata. */
  twitter?: SeoTwitter
  /** Arbitrary additional `<meta>` tags. */
  meta?: SeoMetaTag[]
  /** Arbitrary additional `<link>` tags. */
  link?: SeoLinkTag[]
}

/**
 * A renderable description of a single head tag, produced by
 * {@link import('./build-seo-tags').buildSeoTags}. The server turns these into
 * HTML strings; the client turns them into DOM nodes — one source of truth.
 */
export interface SeoTagDescriptor {
  tag: 'title' | 'meta' | 'link'
  attrs: Record<string, string>
  content?: string
}
