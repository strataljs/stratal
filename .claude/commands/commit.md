Generate a commit message for the currently staged changes.

## Instructions

1. Run `git diff --cached --stat` to get a summary of staged files.
2. If nothing is staged, tell the user and stop.
3. Run `git diff --cached` to read the actual staged changes.
4. Run `git log --oneline -5` to see recent commit style for consistency.
5. Based on the diff, generate a commit message.

### Format

```
type(scope): subject

body (optional)
```

- **type**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`
- **scope**: package or area changed (e.g., `core`, `framework`, `seeders`, `testing`)
- **subject**: imperative mood, lowercase, no period, under 50 characters
- **body**: wrap at 72 characters, explain **why** not **what**, separate from subject by a blank line

### When to include a body

- Multiple files changed across different concerns
- Non-obvious reasoning behind the change
- Breaking changes (prefix body with `BREAKING CHANGE:`)

For single-purpose, self-explanatory changes, the subject line alone is sufficient.

## Rules

- Be concise. One-line subjects are preferred when the change is simple.
- Use imperative mood ("add", not "added" or "adds").
- Do not fabricate changes — only describe what is actually in the diff.
- If multiple unrelated changes are staged, suggest the user split them into separate commits.
- Match the style of recent commits in the repo.
- Output ONLY the commit message in a single copyable code block. Do not add commentary.
