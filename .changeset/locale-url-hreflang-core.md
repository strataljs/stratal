---
"stratal": patch
---

Add locale-aware URL generation for path-prefixed and querystring localized routing

- Route URL generation now applies the active locale automatically — e.g. `uri.route('posts.show', { locale: 'es' })` produces `/es/posts/...` when locale prefixing is enabled.
- New `LocaleUrlConfig` and a locale-aware URL service for producing locale variants of any URL (used for hreflang alternates, canonical URLs, sitemaps, and redirects).
- Configurable trailing-slash handling for consistent URL formatting.
