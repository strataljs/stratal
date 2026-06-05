# CLAUDE.md

Maintainer-facing instructions for working on the Stratal monorepo with Claude or other AI agents. Not for end-users of the published packages — consumer API guidance lives at `.agents/skills/stratal/SKILL.md` (+ 18 references under `.agents/skills/stratal/references/`).

## Packages

| Path | npm | Scope |
|---|---|---|
| `packages/core` | `stratal` | Core framework: DI, modules, routing, queues, cron, events, seeders, Quarry CLI, i18n, cache, logger, errors, email, storage, OpenAPI |
| `packages/testing` | `@stratal/testing` | Test utilities, mocks, MSW fetch, Vitest plugin |
| `packages/framework` | `@stratal/framework` | Auth (Better Auth), Database (ZenStack), access control (Casbin), RBAC, factories, guards |
| `packages/inertia` | `@stratal/inertia` | Inertia.js v3 server adapter for React SSR on CF Workers |
| `packages/inertia-modal` | `@stratal/inertia-modal` | Backend-driven modal primitive built on `@stratal/inertia` |
| `packages/feature-flags` | `@stratal/feature-flags` | Cloudflare Flagship feature flags (binding API), Inertia auto-share, React hooks |

Per-package contributor rules: `packages/<name>/CLAUDE.md` — auto-load when working in that directory.

## Workspace rules

- Yarn 4 workspaces. Node ≥22. ESM-only (`"type": "module"`).
- Don't hand-edit `packages/*/package.json` `exports` — `tsdown` regenerates on build. Add new sub-paths via the package's `tsdown.config.ts` `entry` list. For an alias (path A exposed at name B) use `customExports`.
- Keep `experimentalDecorators` + `emitDecoratorMetadata` on (needed by the DI decorator system).
- DI tokens: `Symbol.for('stratal:...')` in each package's `tokens.ts`. Never strings.
- Type-only imports must be marked `type` (`consistent-type-imports`). Both `import type { X }` and `import { type X }` satisfy the rule — `import type { X }` is the prevailing style; don't flag either form. Leading-underscore for unused vars.
- `oxlint` lints. Husky + lint-staged auto-fixes staged `.ts/.mts` on commit. Don't pass `--no-verify`.
- Shared build helpers in `tsdown.base.ts` (`baseConfig`, `withTypesExports`). Touching this file affects every package — typecheck and build all on changes.
- Build target tsconfig is `tsconfig.build.json` per package (separate from the editor `tsconfig.json`). Don't point `tsdown` at the editor config.

## Versioning & release

- Changesets with **fixed** versioning across all packages: `yarn changeset` before committing version-worthy changes. One bump bumps all packages together, so changes here are coupled.
- Release runs on tag push via `.github/workflows/publish.yml`.

## CI

- `.github/workflows/ci.yml` — lint, typecheck, test, build per package on every PR.
- Framework CI starts a Postgres service container and runs `pretest` for ZenStack/Wrangler codegen.
- Benchmark workflow compares core perf on PRs with a 150% alert threshold.
- Also active: CodeQL, dependency-review, OSSF Scorecard, docs (typedoc to GitHub Pages).
