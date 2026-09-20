---
'@stratal/feature-flags': patch
---

Release alongside the rest of the packages; nothing changed in this one.

Every Stratal package is versioned as one fixed group, so `@stratal/feature-flags` is republished at the same version as the packages it builds on rather than being left behind. Its peer ranges are open-ended, so an existing install keeps resolving — upgrade only to keep one aligned set of versions across the framework.
