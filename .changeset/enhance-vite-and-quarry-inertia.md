---
"@stratal/inertia": patch
---

Add `createClientViteConfig` helper, client manifest injection, sourcemap option, and `InertiaQuarryModule` for CLI integration

- New `createClientViteConfig()` produces a ready-made Vite config for the client bundle with automatic reflect-metadata invocation for tsyringe compatibility.
- Inertia build command now injects the client manifest into the SSR bundle for asset resolution.
- Type generator enhanced to extract controller page prop types with promise unwrapping.
- New `@stratal/inertia/quarry` export provides `InertiaQuarryModule` for registering Inertia CLI commands.
