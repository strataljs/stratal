---
"@stratal/testing": patch
---

Add opt-in database isolation for parallel test execution

Run test files in parallel against PostgreSQL without lock or data collisions: each file gets its own database cloned from a migrated template and dropped on teardown.

- Enable per-file isolation by passing `database: { isolation: 'database' }` to the Vitest plugin (and optionally `binding` to target a specific Hyperdrive binding, defaulting to `DB`).
- New `@stratal/testing/database` entry point exposing helpers to wire up the template-database lifecycle in a Vitest `globalSetup`.
- Isolation is opt-in — existing tests are unaffected. `pg` is an optional peer dependency, required only when isolation is enabled.
