# Agent setup

The tooling that keeps agent-written code in line with the
[style guides](../style/README.md) and the rules in `AGENTS.md`: what is active,
what is planned, and when each piece is used in a PR.

## Active in the repository

| What | Where | What it does |
| --- | --- | --- |
| Working rules | `AGENTS.md`, section "Rules for every change"; `CLAUDE.md` imports `AGENTS.md` | every agent (Claude Code, Cursor) reads them first |
| Coding rules | `docs/style/*.md`, rule IDs `CMP`, `TS`, `CMT`, `DB`, `SRV`, `WEB`, `INT`, `TST`, `SEC`, `GIT` | what code must look like |
| Path-scoped rules | `.claude/rules/*.md`, symlinks to the guides in `docs/style/` | Claude Code loads a guide when it reads or edits a file matching the guide's `paths` frontmatter; `git.md` loads in every session |
| Hooks | `.claude/hooks/*.ts`, registered in `.claude/settings.json` | see [Hooks](#hooks) |
| No attribution | `.claude/settings.json`, key `attribution` | commits and PRs carry no co-author footer (GIT-4) |
| Plugins | `.claude/settings.json`, key `enabledPlugins`: `pr-review-toolkit`, `security-guidance` | review agents for comments, silent failures, types and tests; vulnerability warnings while editing |
| Reviewer agents | `.claude/agents/neighbourhood-auditor.md`, `.claude/agents/style-reviewer.md` | defects to repair in the surrounding code (CMP-15); a diff checked against the rules, comments included |
| Skills | `.agents/skills/*`, linked into `.claude/skills/`, pinned in `skills-lock.json` | six Next.js skills, `better-auth-best-practices`, `playwright-best-practices` |
| MCP servers | `.mcp.json`: `next-devtools`, `proxbase` | the running Next.js app; Proxmox test clusters |

The language server comes from the `typescript-lsp` plugin. Each developer
installs it at user scope, with the `typescript-language-server` binary on the
path (`bun add -g typescript-language-server typescript`).

### Hooks

Each hook is a Bun script that reads its event as JSON on stdin through
`.claude/hooks/shared.ts`. Exit code 2 blocks the action, or returns the problem
to Claude, with stderr as the message.

| Hook | Event | Effect |
| --- | --- | --- |
| `guard-bash.ts` | before every Bash command | blocks skipping the git hooks (GIT-5), marking a PR ready (GIT-7), force pushes to `main` (GIT-6), bare `bun test` (TST-1), and attribution footers in commits and PRs (GIT-4). It checks each segment of a command by the command the segment starts with, so text that only mentions a flag is not blocked. |
| `check-edited-file.ts` | after every Edit or Write | runs `biome check --write` on the edited file when it is inside the repository, and returns what Biome cannot fix |
| `stop-check.ts` | before Claude ends its turn | runs `biome check` on every changed and untracked file; when Claude is already continuing for this hook, it lets Claude stop |

`.claude/hooks/tsconfig.json` gives the scripts the repository's Bun types.
Check them with `bunx tsc -p .claude/hooks`. From Phase 1, PR 1.2,
`stop-check.ts` also runs the comment gate.

## Not yet enabled

| What | When | Enforces |
| --- | --- | --- |
| [Biome rules](#biome-rules) | Phase 1, PR 1.2, as warnings first and errors once the existing code passes | TS-3, TS-4, TS-10, CMP-14, INT-6, the env gate in the editor |
| [GitHub Actions](#github-actions) | when the `ANTHROPIC_API_KEY` and `CLAUDE_API_KEY` secrets exist | on-demand review against `docs/style`; a security pass on PRs from collaborators |
| Sentry and Vercel MCP servers (optional) | any time: `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp` and `claude mcp add --transport http vercel https://mcp.vercel.com` | errors and build logs after each deploy (risks R15, R19) |

Already built in, nothing to install: `/code-review` with an effort level (for
example `/code-review high`), `/security-review`, `/simplify`, and
`/code-review ultra` for a multi-agent cloud review of a branch, started by you
and billed separately.

Not recommended:

- the `commit-commands` plugin, because commits and PRs follow GIT-1 to GIT-10,
  which it does not know;
- the `code-review` plugin, because the built-in `/code-review` covers it;
- `sonarqube`, because it needs a SonarQube server;
- `feature-dev`, because it overlaps with the phase process.

Third-party skills are reviewed before they are added. When a skill's advice
conflicts with `docs/style`, the guide wins.

## The workflow for every PR

| Step | Tool |
| --- | --- |
| 1. Read the rules and the code | `AGENTS.md`, the guides the path-scoped rules load, the language server for callers |
| 2. Find what must be repaired | `neighbourhood-auditor` agent, on the planned change |
| 3. Pin defects, then write the code | tests first (CMP-16, TST-3); the edit hook runs Biome on every change |
| 4. Verify | `bun check`, `bun typecheck`, `bun check:boundaries`, `bun run test`, Playwright where pages changed; the `next-dev-loop` skill for runtime behaviour |
| 5. Review | `style-reviewer` agent; `pr-review-toolkit` agents; `/code-review high` |
| 6. Security | `/security-review`, once per phase (SEC-14) |
| 7. Open the PR | a draft PR with the GIT-8 template; the guard hook keeps it a draft |

## Configuration for later

### Biome rules

These go into `biome.jsonc` in Phase 1, PR 1.2:

```jsonc
"complexity": {
  "noExcessiveCognitiveComplexity": { "level": "warn", "options": { "maxAllowedComplexity": 15 } },
  "noExcessiveLinesPerFunction": { "level": "warn", "options": { "maxLines": 60 } }
},
"style": {
  "noNonNullAssertion": "error",
  "noDefaultExport": "error",
  "noProcessEnv": "error"
},
"nursery": { "useExhaustiveSwitchCases": "error" }
```

**Overrides:**

- `noDefaultExport` is off for Next.js route files, integration roots and
  configuration files (TS-10).
- `noProcessEnv` is off for the bootstrap modules in the
  [env inventory](../architecture/env-inventory.md#bootstrap-allowlist).
- `suspicious/noConsole` is on for `packages/integration-*` (INT-6).

**Strictness.** The two complexity rules start as warnings, because today's
code exceeds them. They become errors when the code they flag has been split.

### GitHub Actions

On-demand review. A comment containing `@claude review` on a PR triggers it:

```yaml
name: Claude review
on:
  issue_comment:
    types: [created]
jobs:
  review:
    if: github.event.issue.pull_request && contains(github.event.comment.body, '@claude review')
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: Review this pull request against AGENTS.md and docs/style. Report each violation with its rule ID and file:line.
```

Automatic security review on PRs from collaborators only. The action is not
hardened against prompt injection in untrusted PRs:

```yaml
name: Security review
on:
  pull_request:
jobs:
  security:
    if: contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.pull_request.author_association)
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: anthropics/claude-code-security-review@main
        with:
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
```

Pin both actions to a commit SHA before merging the workflows. Explanatory
comments do not go into the workflow files themselves (CMT-15).
