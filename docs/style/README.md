# Style guides

How code in this repository is written. These guides apply to every change from
Phase 1 of the [integration-first programme](../architecture/integration-first.md)
on, made by people or by agents.

`AGENTS.md` holds the working rules (how to approach a change). These guides hold
the coding rules (what the code must look like). When a guide and `AGENTS.md`
disagree, `AGENTS.md` wins, and the guide is fixed in the same PR.

| Guide | Covers | Prefix |
| --- | --- | --- |
| [composition.md](composition.md) | the units code is built from; transactions, side effects, retries; repairing defective code next to a change | CMP |
| [comments.md](comments.md) | comments and documentation: what to write, what never to write | CMT |
| [typescript.md](typescript.md) | language, modules, naming, errors, Zod | TS |
| [data.md](data.md) | Drizzle schema, migrations, backfills, queries, transactions | DB |
| [server.md](server.md) | tRPC, server actions, route handlers, crons, workflows, events | SRV |
| [web.md](web.md) | Next.js, React, Cache Components, i18n, UI | WEB |
| [integrations.md](integrations.md) | integration packages, ports, the SDK | INT |
| [testing.md](testing.md) | unit, integration, contract, E2E | TST |
| [security.md](security.md) | secrets, personal data, authorisation, untrusted input | SEC |
| [git.md](git.md) | branches, commits, pull requests | GIT |

## How to read a rule

Every rule has an ID, such as `CMP-3`. Reviews and PR descriptions cite rules by
ID. A rule is written as an instruction ("do", "never"). An example follows the
rule when the rule alone could be read more than one way.

A rule marked **(defect)** describes a correctness, security or data-integrity
property. Code that breaks such a rule is a defect wherever it is found.
[CMP-15](composition.md#repairing-defective-code-next-to-a-change) requires it to
be repaired when it is part of the surrounding code of a change. The other rules
are conventions: new and rewritten code follows them, and existing code is left as
it is unless the change rewrites it anyway.

## How the rules are enforced

| Rule | Enforced by |
| --- | --- |
| Formatting, imports, most TS rules | Biome (`bun check`, `bun check:ci`), editor and pre-commit |
| Layering | dependency-cruiser (`bun check:boundaries`) |
| Types | `bun typecheck` |
| Behaviour | `bun run test`, the conformance and contract suites, Playwright |
| Environment reads, coverage, comments in new code | the gates in [integration-first.md §13](../architecture/integration-first.md#13-quality-gates) |
| Everything else | review: the `style-reviewer` and `neighbourhood-auditor` agents in `.claude/agents/`, then a human |

## How agents load the guides

Each guide except this index is linked into `.claude/rules/` as a symlink, so
Claude Code loads it as a rule:

- a guide with a `paths` list in its frontmatter loads when Claude reads or
  edits a file matching one of those globs;
- `git.md` has no `paths` list and loads at the start of every session.

Changing a guide's `paths` changes when it loads. A new guide gets a symlink in
`.claude/rules/` in the same PR. Other agents reach the guides through the area
table in `AGENTS.md`.

## Changing a rule

Change the guide in its own PR, with the reason in the description. Do not change
a rule in the PR that would break it.
