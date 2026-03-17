---
"stratal": patch
---

Add hypermedia link builder and cursor-based pagination support to RouterContext

### Details

- Add `LinkBuilderService` for generating HAL-style `_links` on resource responses (self, related, collection navigation)
- Add `RouterContext.cursorCollection()` for cursor-based paginated responses with automatic `self`, `next`, and `first` links
- Add `RouterContext.collection()` enhancements for offset-based paginated responses with `self`, `next`, `prev`, `first`, and `last` links
- Add `CursorCollectionSchema` and `CollectionSchema` Zod helpers for OpenAPI response definitions
- New `stratal/router/hypermedia` sub-path export with `LinkBuilderService`, types, and schemas
- Add `ROUTER_TOKENS.LinkBuilder` DI token and auto-register `LinkBuilderService` in route registration
