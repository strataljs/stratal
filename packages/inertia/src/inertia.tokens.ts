export const INERTIA_TOKENS = {
  Options: Symbol.for('stratal:inertia:options'),
  InertiaService: Symbol.for('stratal:inertia:service'),
  TemplateService: Symbol.for('stratal:inertia:template'),
  ManifestService: Symbol.for('stratal:inertia:manifest'),
  SsrRenderer: Symbol.for('stratal:inertia:ssr-renderer'),
  DocumentRenderer: Symbol.for('stratal:inertia:document-renderer'),
  HreflangService: Symbol.for('stratal:inertia:hreflang'),
  SeoService: Symbol.for('stratal:inertia:seo'),
} as const
