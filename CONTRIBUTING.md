# Contributing to Stratal

Thanks for your interest in contributing to Stratal! This guide will help you get set up and familiar with the development workflow.

## Getting Started

### Prerequisites

- Node.js 20+
- [Corepack](https://nodejs.org/api/corepack.html) enabled (ships with Node.js)

### Setup

```bash
git clone https://github.com/strataljs/stratal.git
cd stratal
corepack enable
yarn install
```

### Monorepo Layout

```
packages/
  core/       # stratal — core framework (DI, modules, routing, queues, storage, email, i18n)
  testing/    # @stratal/testing — test utilities, mocks, and factories
```

## Development Workflow

### Common Commands

```bash
# Lint all packages
yarn lint

# Lint with auto-fix
yarn lint:fix

# Type check
yarn workspace stratal typecheck
yarn workspace @stratal/testing typecheck

# Run tests
yarn workspace stratal test

# Run tests in watch mode
yarn workspace stratal test:watch

# Test coverage
yarn workspace stratal test:coverage

# Build
yarn workspace stratal build
```

### Pre-commit Hooks

The repo uses [husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged). On every commit, `eslint --fix` runs automatically on staged `.ts` and `.mts` files.

## Making Changes

1. **Branch from `main`** — create a feature or fix branch off `main`.

2. **Follow existing patterns** — the codebase uses decorators, Symbol-based DI tokens, and a module-based architecture. Look at existing code for reference.

3. **Add a changeset** — before committing, run:

   ```bash
   yarn changeset
   ```

   This prompts you to select which packages are affected and whether the change is a patch, minor, or major version bump. It creates a markdown file in `.changeset/` describing your change.

   **When to use each level:**
   - **patch** — bug fixes, internal refactors with no API changes
   - **minor** — new features, new exports, non-breaking additions
   - **major** — breaking changes to public API

   Changesets are consumed during the release process to automatically bump versions and generate changelogs.

## Code Style

- **ESLint** with strict + stylistic TypeScript rules is the single source of truth for code style. The pre-commit hook enforces this automatically.
- **ESM-only** — use `import`/`export`, never `require`.
- **Build uses `tsc`** (not esbuild/tsup) because tsyringe requires `emitDecoratorMetadata`, which esbuild doesn't support.

## Testing

- Test framework: [Vitest](https://vitest.dev/)
- Test files go in `src/**/__tests__/**/*.spec.ts`
- Run tests:

  ```bash
  yarn workspace stratal test
  ```

- Run with coverage:

  ```bash
  yarn workspace stratal test:coverage
  ```

## Pull Requests

- CI runs **lint**, **typecheck**, **test**, and **build** on every PR.
- Include a changeset unless the change is docs-only or CI-only.
- Keep PRs focused — one feature or fix per PR where possible.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
