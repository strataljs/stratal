---
"stratal": patch
---

Match locale-prefixed routes ahead of their primary so catch-alls don't swallow the locale segment

Routes registered with `Router.locales(...)` previously sorted **after** their primary, so a request like `/sw/applications/123` against a primary catch-all (`/:slug{.+}`) was matched as `slug='sw/applications/123'` instead of `locale='sw' + slug='applications/123'`. Locale variants now sort just ahead of their primary using the path-with-locale-stripped score plus their extra segment count as the tie-breaker, restoring the expected priority for both static and catch-all routes.
