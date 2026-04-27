---
"stratal": patch
---

Fix route path joining to avoid double slashes and handle empty route paths

Composing a controller base path with an empty `@Route({ path: '' })` or a base path ending in `/` could previously yield URLs with double slashes or a missing trailing route. Empty route paths now resolve to the controller's base path, and trailing slashes on the base path are stripped consistently.
