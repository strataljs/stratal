Update the Stratal agent skill files in `.agents/skills/stratal/` to reflect source code changes.

## Workflow

1. Determine the base branch: check if this branch tracks an upstream, otherwise default to `main`.
2. `git log <base>..HEAD --oneline` — understand the scope of changes.
3. `git diff <base>...HEAD --stat` — identify which source files changed.
4. `git diff <base>...HEAD` — read the actual changes. Focus on **public-facing API changes**: new/renamed/removed classes, decorators, types, functions, CLI commands, config options, exports. Ignore internal implementation details.
5. Read all existing skill files: `SKILL.md`, `references/*.md`, `assets/*.md`.
6. For each public-facing change, identify which skill file(s) it belongs to (match by feature area).
7. Make targeted edits. Prefer editing existing sections. Add new sections or files only for entirely new feature areas.
8. Verification pass:
   - Search all skill files for renamed or removed API names — fix any stale references.
   - Confirm import paths in code examples are correct.
   - Verify `SKILL.md` reference loading guide descriptions match reference file content.

## Skill Structure (three-tier progressive disclosure)

| Tier | File | When loaded | Contents |
|------|------|-------------|----------|
| 1 | `SKILL.md` YAML frontmatter | Always | Skill name, trigger description, metadata |
| 2 | `SKILL.md` body | When skill activates | Critical rules, quick API reference, workflows, example interactions, troubleshooting, reference loading guide |
| 3 | `references/*.md` | On demand | Detailed API docs, full examples, configuration options |

`assets/` holds supporting templates (e.g. project scaffold).

## Writing Style

Write for **AI agents executing tasks**, not for humans reading documentation.

- Imperative and actionable: "Use X", "Add Y", "Import Z from"
- Every code example must include the correct import path
- Show the simplest approach first, advanced options after
- Use practical, copy-pasteable examples — not pseudocode
- Prefer patterns over prose: agents act on examples, not explanations

**Never document internal plumbing** (agents never import or call these directly):
- Internal classes/services: `RouteRegistry`, `RouterResolver`, `VersioningService`, `LocalePathService`, `runWithContainer`, `containerStorage`
- Internal strategies: two-pass registration, specificity scoring, path expansion
- Internal types: `RouterEntry`, `RegisteredRoute`, `RouteRegistrationInput`

## Rules

- Only edit files affected by the diff. Do not touch unrelated files.
- Do not fabricate APIs — only document what exists in the source diff.
- Keep `SKILL.md` under 400 lines. Move detail to reference files.
- Update `SKILL.md` troubleshooting when new user-facing errors are introduced.
- Update `SKILL.md` example interactions when new user-facing features ship.
- Update `SKILL.md` reference loading guide if a reference file's scope changes.
- Bump `version` in `SKILL.md` frontmatter on significant changes.
- `description` in frontmatter: format as `[What it does] + [When to use] + [Key capabilities]`, include trigger phrases, max 1024 chars, no XML tags.
