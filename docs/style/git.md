# Git, commits and pull requests (GIT)

**GIT-1 Never commit to `main`.** Create a branch named `<type>/<short-topic>`
(`feat/integration-sdk-v2`, `fix/backup-outside-transaction`).

**GIT-2 Commit messages follow Conventional Commits.**

- commitlint enforces it in the `commit-msg` hook and in CI.
- The subject is lowercase and imperative, with no full stop:
  `fix: keep compensations running and erase subject data on offboard`.
- A scope is optional, and names a package or area: `fix(novnc-proxy): …`,
  `chore(deps): …`.

**GIT-3 Each commit is one logical change, and passes `bun check` and the tests
it affects.** A repair made under CMP-15 gets its own commit inside the PR.

**GIT-4 No attribution footers.** No "Co-Authored-By" and no "Generated with
Claude Code" in commits or PR descriptions.

**GIT-5 Never pass `--no-verify`.** The pre-commit hook only runs lint-staged. If
it fails, fix the cause.

**GIT-6 Never rewrite shared history.** No `git push --force` to a branch someone
else has pulled, and never to `main`.

**GIT-7 Pull requests stay drafts.** Open them with `gh pr create --draft`, and
never run `gh pr ready`. The user decides when a PR is ready.

**GIT-8 Every PR description has the same sections:**

```markdown
## What changed
## Why
## Behaviour changes
<!-- "None", or each change and the decision that accepted it (D9) -->
## Repaired along the way
<!-- each CMP-15 repair with its risk ID or rule ID, or "None" -->
## Gates
<!-- each gate from integration-first.md §13 with its result; failures pasted, not summarised -->
## Security review
<!-- /security-review findings and their resolution -->
```

**GIT-9 Report gates honestly.** A failing or skipped gate is reported with its
output and the reason it failed or was skipped. A phase is not done while any of
its gates is red.

**GIT-10 Stack large work.** A repair that touches more than ten files or a
second domain ships first, as its own draft PR
([CMP-17](composition.md#repairing-defective-code-next-to-a-change)). The change
that needs it stacks on top.
