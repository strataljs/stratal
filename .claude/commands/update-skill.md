Update the Stratal agent skill files in `.agents/skills/stratal/` to reflect source code changes.

## Instructions

1. Determine the base branch by checking if this branch tracks an upstream, otherwise default to `main`.
2. Run `git log <base>..HEAD --oneline` to get all commits on this branch.
3. Run `git diff <base>...HEAD --stat` to identify which source files changed.
4. Run `git diff <base>...HEAD` to read the actual code changes. Focus on **public-facing API changes**: new/renamed/removed classes, decorators, interfaces, types, functions, CLI commands, configuration options, and exports. Ignore internal implementation details.
5. Read all existing skill files to understand current state:
   - `.agents/skills/stratal/SKILL.md` (main skill file)
   - All files in `.agents/skills/stratal/references/`
   - All files in `.agents/skills/stratal/assets/`
6. For each public-facing change found in step 4, determine which skill file(s) need updating by matching the change to the appropriate file (see Skill Structure below).
7. Make targeted edits to affected files. Prefer editing existing sections over adding new ones. Only add new sections or files when the change introduces an entirely new feature area.
8. After all edits, run a verification pass:
   - Search all skill files for references to renamed or removed APIs.
   - Confirm code examples use correct import paths.
   - Verify `SKILL.md` reference table descriptions match actual reference file content.
   - Ensure no internal implementation details leaked into user-facing docs (see What to Exclude).

## Skill Structure

The skill uses Anthropic's three-tier progressive disclosure model:

| Tier | File(s) | When Loaded | What Goes Here |
|------|---------|-------------|----------------|
| **1. Frontmatter** | `SKILL.md` YAML header | Always (system prompt) | Skill name, trigger description, metadata |
| **2. Main instructions** | `SKILL.md` body | When skill activates | Critical rules, quick API reference, workflows, example interactions, troubleshooting, reference loading guide |
| **3. Reference files** | `references/*.md` | On demand by Claude | Detailed API docs, full examples, configuration options |

Supporting templates live in `assets/`.

### Current Reference Files

| File | Covers |
|------|--------|
| `routing.md` | Controllers, RouteConfig, RouterContext, named routes, URL generation, domain routing, Router fluent API, versioning, OpenAPI |
| `middleware-and-guards.md` | RouteConfigurable, middleware registration, Middleware interface, guards, @UseGuards |
| `modules-and-di.md` | @Module, providers, scopes, DI tokens, dynamic modules, lifecycle hooks |
| `errors-and-i18n.md` | ExceptionHandler, ApplicationError, I18nModule, detection strategies, I18nService, withI18n |
| `events.md` | @Listener, @On, EventRegistry, database events |
| `database.md` | DatabaseModule, ZenStack, named connections, plugins, transactions |
| `auth-and-rbac.md` | AuthModule, AuthContext, AuthService, RbacModule, CasbinService |
| `queues-and-cron.md` | QueueModule, consumers, queue senders, CronJob |
| `seeders.md` | Seeder base class, SeederRegistry, quarry commands |
| `quarry-cli.md` | Built-in commands, custom commands, signature syntax |
| `testing.md` | stratalTest plugin, TestingModule, TestHttpClient, MockFetch, Factory |
| `infrastructure.md` | Cache, Logger, Email, Storage, OpenAPI |
| `inertia.md` | Inertia.js server adapter, page rendering, shared data, SSR, flash messages |
| `config.md` | ConfigModule, registerAs, ConfigService |
| `incremental-adoption.md` | Mounting Stratal into existing Hono apps |

## Writing Style

This skill is for **app developers using Stratal**, not for framework maintainers. Write as if explaining to a user who wants to build features, not someone maintaining the framework internals.

### Good (user-facing)

```
Use `ctx.route('notes.show', { id: '1' })` to generate a URL from a named route.
```

```
Add `APP_SECRET` to your `wrangler.jsonc` vars to enable signed URLs.
```

```
Implement `RouteConfigurable` in your module to configure middleware for its controllers.
```

### Bad (maintainer-facing / internal)

```
`RouteRegistrationService` uses a two-pass strategy to collect and register routes.
```

```
Call `runWithContainer(container, fn)` to execute code within a container context.
```

```
The `RouterResolver` merges parent config with group overrides and resolves middleware tokens.
```

### Tone

- Imperative and actionable: "Use X", "Add Y", "Import Z from"
- Show the simplest approach first, advanced options second
- Include import paths in code examples
- Use practical, copy-pasteable code examples — not pseudocode

## Anthropic Skill Best Practices

Apply these when writing or updating skill content:

1. **Progressive disclosure** — Keep `SKILL.md` focused on essentials (critical rules, quick reference, workflows). Move detailed API docs and full examples to `references/`.

2. **Description field** (YAML frontmatter) — Format: `[What it does] + [When to use it] + [Key capabilities]`. Include specific trigger phrases users might say. Must be under 1024 characters. No XML tags.

3. **Be specific and actionable** — Every instruction should tell Claude exactly what to do. "Import `z` from `stratal/validation`" is good. "Validate the data" is bad.

4. **Reference bundled resources clearly** — When `SKILL.md` mentions a topic covered in a reference file, include a pointer: "For full routing reference, see `references/routing.md`."

5. **Include error handling** — The troubleshooting section in `SKILL.md` should cover common errors users will encounter. Format: **"Error message"** -> Cause and fix.

6. **Example interactions** — The "Example Interactions" section maps user phrases to actions. Each entry: **"User says X"** -> Read reference, do Y.

## What to Exclude

Never include these internal details in skill files — they are framework plumbing, not user-facing API:

- Internal classes: `RouteRegistry`, `RouteRegistrationService`, `RouterResolver`, `RouterEntry`, `RouterInternals`, `HonoApp`
- Internal services: `VersioningService`, `LocalePathService` (users configure via options, not these services directly)
- Internal functions: `buildRouteUrl()`, `getContainer()`, `runWithContainer()`, `containerStorage`
- Implementation strategies: two-pass registration, route specificity scoring, path expansion algorithms
- Internal types: `RouterEntry`, `RegisteredRoute`, `RouteRegistrationInput`

**Rule of thumb:** If a user never imports it, calls it, or configures it directly, it does not belong in the skill.

## Rules

- Only update files that are affected by the code changes. Do not rewrite files that haven't changed.
- Prefer editing existing sections over adding new ones. Add new sections only for entirely new feature areas.
- Do not add new reference files unless the change introduces a major new subsystem that doesn't fit existing files.
- Every code example must include the correct import path (e.g., `import { Controller } from 'stratal/router'`).
- Do not fabricate APIs — only document what exists in the source code diff.
- Keep `SKILL.md` under 400 lines. Move detailed content to reference files.
- Update the `SKILL.md` reference loading guide table if any reference file's scope changes.
- Update the `SKILL.md` troubleshooting section when new user-facing errors are introduced.
- Update the `SKILL.md` example interactions when new user-facing features are added.
- After edits, search all skill files for any references to renamed or removed APIs and fix them.
- Bump the `version` in `SKILL.md` frontmatter metadata when making significant changes.
