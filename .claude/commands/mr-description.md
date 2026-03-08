Analyze the current branch and generate a merge request title and description.

## Instructions

1. Determine the base branch by checking if this branch tracks an upstream, otherwise default to `main`.
2. Run `git log <base>..HEAD --oneline` to get all commits on this branch.
3. Run `git diff <base>...HEAD --stat` to get a summary of changed files.
4. Run `git diff <base>...HEAD` to read the actual code changes.
5. Based on the commits and diff, generate:

### Title
- Use conventional commit format: `type(scope): description`
- Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`
- Keep under 72 characters
- Use imperative mood ("add", not "added")
- Scope should reflect the package or area changed (e.g., `core`, `framework`, `seeders`)

### Description
Use this template:

```
## Summary
<!-- 2-4 sentences explaining WHAT changed and WHY -->

## How to Test
<!-- Steps a reviewer can follow to verify the changes -->

## Breaking Changes
<!-- List any breaking changes, or remove section if none -->
```

## Rules
- Be concise and succinct. Prefer short, punchy bullets over long sentences. No fluff.
- The summary should be 1-2 sentences max.
- Bullet points in How to Test should each be a single short line — no wrapping.
- Focus on the **why**, not just the **what** — reviewers can read the diff for the what.
- Group related changes together under a single bullet when possible.
- If there are breaking changes, always include the "Breaking Changes" section with migration steps.
- If there are no breaking changes, omit that section entirely.
- Do not fabricate changes — only describe what is actually in the diff.
- Keep the summary concise but informative enough for someone unfamiliar with the context.
- Output ONLY the title and description in a single copyable block. Do not add commentary.
