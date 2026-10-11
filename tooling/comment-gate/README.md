# tooling/comment-gate

Fails when a change adds a comment line that breaks the rules a pattern can
check in [`docs/style/comments.md`](../../docs/style/comments.md): CMT-8 (the
hedge list), CMT-10 (`TODO`, `FIXME`, `HACK`, `XXX`) and CMT-11
(commented-out code).

```bash
bun run comment:check             # changes since origin/main, working tree included
bun run comment:check HEAD^1      # what CI runs on a pull request's merge commit
```

| Exit code | Meaning |
| --- | --- |
| 0 | no violation |
| 1 | at least one violation |
| 2 | the gate could not check everything: git failed (for example, the base does not exist), or a file could not be read or parsed |

## What it checks

`src/run.ts` takes the merge base of the given ref and `HEAD`, and diffs the
working tree against it for `.ts`, `.tsx`, `.js` and `.mjs` files. Untracked
files count as entirely added. For each file:

1. Babel parses the file and lists its comments (`src/comments.ts`).
2. Only comment lines the diff added are checked (`src/rules.ts`).

| Rule | Fails on | Never fails on |
| --- | --- | --- |
| CMT-8 | a word or phrase of the hedge list, in any case, including `shouldn't` and `mightn't`, and a phrase wrapped across two comment lines | text in backticks, URLs |
| CMT-10 | `TODO` not followed by `(#<issue>):`; `FIXME`, `HACK`, `XXX` | `TODO(#412): …`; text in backticks |
| CMT-11 | a line that ends with `;`, `{`, `}` or `/>` and parses as TypeScript or TSX; a line with code punctuation whose whole comment parses | TSDoc comments, whose examples are code; directives (`///`, `biome-ignore`, `@ts-`, `eslint-`, `#region`) |

`HEDGES` in `src/rules.ts` is the CMT-8 list word for word, and a test fails
when the two differ. A domain term that contains a listed word, such as
`magic link` or `temporary guest`, is written in backticks.

The licence header CMT-16 requires, the first block comment of a file when it
names the GNU General Public License, is never checked.

The gate checks the form of a `TODO`, not whether its issue is open.

## Where it runs

- CI, on every pull request, in the "Lint, types and boundaries" job. Any
  non-zero exit fails the job.
- The Claude Code stop hook, `.claude/hooks/stop-check.ts`, before a turn ends,
  unless Claude is already continuing for the hook. It blocks on exit code 1
  only, so a missing `origin/main` never blocks a turn.
