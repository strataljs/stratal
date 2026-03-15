---
"stratal": patch
---

Replace Scalar with Swagger UI as the default OpenAPI docs renderer and add pluggable UI support

### Details

- Replace `@scalar/hono-api-reference` dependency with `@hono/swagger-ui`
- Add `OpenAPIUIRenderer` type for custom docs UI renderers
- Add `ui` option to `OpenAPIModuleOptions` with `path` and `renderer` fields
- Support disabling docs UI entirely by setting `ui: false`
- Remove `docsPath` option in favor of `ui.path` (default remains `/api/docs`)

### Breaking Changes

- The `docsPath` option in `OpenAPIModuleOptions` has been removed. Use `ui.path` instead:
  ```ts
  // Before
  OpenAPIModule.forRoot({ docsPath: '/docs' })

  // After
  OpenAPIModule.forRoot({ ui: { path: '/docs' } })
  ```
- The default docs UI is now Swagger UI instead of Scalar. To use a custom renderer (e.g., Scalar), provide a `ui.renderer` function.
