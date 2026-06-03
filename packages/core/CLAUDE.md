# packages/core — CLAUDE.md

Maintainer rules for the `stratal` package. Consumer API depth lives in `.agents/skills/stratal/SKILL.md` and `.agents/skills/stratal/references/`.

## Layout

- Worker entry: `src/stratal.ts` (lazy single-instance init, env+ctx provided per invocation).
- Application bootstrap: `src/application.ts` — fixed 6-phase order. Don't reorder: phase 1 registers core infra (I18n, OpenAPI, Queue, Cache); user modules expect that infra to exist; managers expect modules already initialized.
- DI container: `src/di/container.ts` (two-tier: global + request-scoped child).
- DI tokens: `src/di/tokens.ts`. Use `Symbol.for('stratal:<area>:<thing>')`. New token = new entry there.
- CLI bin sources: `src/bin/quarry.ts`, `src/bin/cloudflare-workers-loader.ts`. No separate `bin/` directory — bin TS lives under `src/bin/` and tsdown emits to `dist/bin/` (no DTS, with shebang).

## Conventions

- Request-scoped services must use `Scope.Request` — they break in singleton scope (no per-request data).
- Adding a new core infrastructure module: register it in phase 1 of `Application` and add its tokens to `src/di/tokens.ts`.
- `npx quarry` resolves the consumer's app via the default `Stratal` export from their `src/index.ts`. The virtual `cloudflare:workers` ESM loader (`src/bin/cloudflare-workers-loader.ts`) lets `Stratal.prepareApp()` run in Node — don't break this loader when changing entry resolution.
- Quarry-level `--env <name>` / `-e <name>` flag (parser at `src/bin/argv.ts`) is stripped from argv before the entry-path check and passed into `unstable_readConfig` and `unstable_getMiniflareWorkerOptions` for environment selection. Commands cannot redefine `--env` — the parser consumes it regardless of position.
- Adding a new sub-path export: add the entry to `tsdown.config.ts` `entry` array; tsdown rewrites `package.json` exports on next build. For aliases use the `customExports` callback (current alias: `./validation` → `./i18n/validation`).
- `dist/chunk-*.mjs` are Rolldown shared chunks. Don't reference them from code or list in exports.

## Testing

Two Vitest projects (`vitest.config.ts`):

- **unit** — node env, `src/**/__tests__/**/*.spec.ts`. No `stratalTest()` plugin here.
- **e2e / workerd integration** — `test/vitest.config.ts`, `test/integration/**/*.spec.ts`, uses `stratalTest()` from `@stratal/testing/vitest-plugin`. Run via `yarn workspace stratal test:integration`.

Other rules:
- `vitest.setup.ts` — shared test setup; don't remove.
- Coverage excludes by convention: `__tests__/`, `*.spec.ts`, `index.ts`, `types.ts`, `tokens.ts`. Match this when adding new excluded shapes.
- Single-file run: `yarn workspace stratal test src/path/__tests__/file.spec.ts`.

## Benchmarks

- Files under `src/__benchmarks__/` and/or `test/benchmarks/` (`.bench.ts`).
- PR threshold is 150% — large regressions fail CI. Investigate before suppressing.
