---
"stratal": patch
---

Add stricter `cuid2()` validator as a drop-in for `z.cuid2()`

Zod's built-in `z.cuid2()` accepts any non-empty lowercase-alphanumeric string, which makes it ineffective as a tenant-id or external-id validator. The new `cuid2()` helper from `stratal/validation` enforces the actual cuid2 shape (24-32 chars, leading letter) while preserving the OpenAPI `format: 'cuid2'` metadata. Custom regex and i18n-aware error messages are supported.

```ts
import { cuid2 } from 'stratal/validation'

z.object({ tenantId: cuid2() })
z.object({ tenantId: cuid2({ pattern: /^[a-z][0-9a-z]{23}$/ }) })
```

Also exports `CUID2_REGEX` for callers composing the pattern into custom schemas.
