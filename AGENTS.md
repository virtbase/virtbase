# Virtbase Development Guide

> **Note:** `CLAUDE.md` is a symlink to `AGENTS.md`. They are the same file.

## Codebase structure

### Monorepo Overview

This is a bun monorepo containing the Virtbase web app and related packages.

```
virtbase/
├── apps/               # Published apps (website)
├── packages/           # Internal packages with shared logic
└── tooling/            # Shared tools for development (tsconfig, tailwind)
```

### README files

Before editing or creating files in any subdirectory (e.g., `packages/*`, `apps/*`), read all `README.md` files in the directory path from the repo root up to and including the target file's directory. This helps identify any local patterns, conventions, and documentation.

**Example:** Before editing `packages/api/src/router/some-file.ts`, read:

- `packages/README.md` (if exists)
- `packages/api/README.md` (if exists)
- `packages/api/src/README.md` (if exists)
- `packages/api/src/router/README.md` (if exists - closest to target file)

## Linting and Types

```bash
bun check              # Full lint
bun check:write        # Auto-fix lint issues
bun typecheck          # TypeScript type checking
```

## Secrets and Env Safety

Always treat environment variable values as sensitive unless they are known test-mode flags.

- Never print or paste secret values (tokens, API keys, cookies) in chat responses, commits, or shared logs.
- Mirror CI env **names and modes** exactly, but do not inline literal secret values in commands.
- If a required secret is missing locally, stop and ask the user rather than inventing placeholder credentials.
- Never commit local secret files; if documenting env setup, use placeholder-only examples.
- When sharing command output, summarize and redact sensitive-looking values.

## Commit and PR Style

- Do NOT add "Generated with Claude Code" or co-author footers to commits or PRs
- Keep commit messages concise and descriptive
- PR descriptions should focus on what changed and why
- Do NOT mark PRs as "ready for review" (`gh pr ready`) - leave PRs in draft mode and let the user decide when to mark them ready

## Task Decomposition and Verification

- **Split work into smaller, individually verifiable tasks.** Before starting, break the overall goal into incremental steps where each step produces a result that can be checked independently.
- **Verify each task before moving on to the next.** After completing a step, confirm it works correctly (e.g., run relevant tests, check types, build, or manually inspect output). Do not proceed to the next task until the current one is verified.
- **Choose the right verification method for each change.** This may include running unit tests, integration tests, type checking, linting, building the project, or inspecting runtime behavior depending on what was changed.
- **When unclear how to verify a change, ask the user.** If there is no obvious test or verification method for a particular change, ask the user how they would like it verified before moving on.

**Pre-validate before committing** to avoid slow lint-staged failures (~2 min each):

```bash
# Run exactly what the pre-commit hook runs on your changed files:
bun biome check --write --no-errors-on-unmatched --files-ignore-unknown=true
```

