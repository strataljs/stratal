---
"@stratal/testing": minor
---

Auto-apply an in-memory `FakeFeatureFlagService` in tests (like the fake storage service). Feature-gated code now resolves without a real Cloudflare Flagship binding — no provider override needed. Configure flags via `module.featureFlags.set(key, value)` and import the fake from `@stratal/testing/feature-flags` for direct use.
