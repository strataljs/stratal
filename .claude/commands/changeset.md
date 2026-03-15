Generate a changeset file for the changes on the current branch.

## Instructions

1. Determine the base branch by checking if this branch tracks an upstream, otherwise default to `main`.
2. Run `git log <base>..HEAD --oneline` to get all commits on this branch.
3. Run `git diff <base>...HEAD --stat` to identify which packages were changed.
4. Run `git diff <base>...HEAD` to read the actual code changes.
5. Check `.changeset/` for existing changeset files (ignore `config.json` and `README.md`) to avoid duplicating already-documented changes.
6. Based on the diff, determine:
   - **Which packages are affected** — only include packages with meaningful code changes (not just lockfile or config tweaks).
   - **Bump type per package** — `patch` for fixes/refactors, `minor` for new features, `major` for breaking changes.
   - **A concise summary** describing what changed and why.

## Package Names

Use the npm package names exactly:

- `stratal` — `packages/core`
- `@stratal/testing` — `packages/testing`
- `@stratal/framework` — `packages/framework`
- `@stratal/seeders` — `packages/seeders`
- `@stratal/zenstack-plugin` — `packages/zenstack-plugin`

## Changeset File Format

Create a **separate changeset file for each affected package** — do not combine multiple packages into one file. This ensures each package's CHANGELOG and GitHub Release contains only its own relevant notes.

Naming convention: `<change-name>-<package-short-name>.md` where `<package-short-name>` is `core`, `testing`, `framework`, or `seeders`.

```markdown
---
"package-name": patch|minor|major
---

Short summary of changes (imperative mood, one sentence)

### Optional Details

- Bullet points for notable changes
- Include breaking changes section if applicable
```

**Example:** A change affecting both `stratal` and `@stratal/testing` produces two files:
- `.changeset/add-queue-retry-core.md` (mentions only `stratal`)
- `.changeset/add-queue-retry-testing.md` (mentions only `@stratal/testing`)

## Rules

- Use imperative mood ("add", not "added").
- Create a separate changeset file for each affected package — do not combine multiple packages into one file.
- The summary line should be a single sentence, concise but informative.
- Only add detail sections for non-trivial changes — simple fixes need only the summary line.
- If there are breaking changes, list them with migration steps under a `### Breaking Changes` heading.
- All packages in the `fixed` group (`stratal`, `@stratal/*`) are versioned together — but only list packages that actually changed.
- Do not fabricate changes — only describe what is in the diff.
- If existing changesets already cover the branch changes, tell the user and stop.
- Write changeset files to `.changeset/` using the naming convention `<change-name>-<package-short-name>.md`.
