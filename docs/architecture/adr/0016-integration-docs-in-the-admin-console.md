# ADR 0016: Integration docs are rendered in the admin console

- Status: Accepted (2026-10-11, decision D6)
- Date: 2026-10-11
- Requirement: R9

## Context

R9 gives every integration a `docs/` folder:

- `README.md`
- `architecture.md`
- `configuration.md`
- `events.md`
- `data-model.md`
- `pages.md`
- `operations.md`
- `security.md`
- `testing.md`

`docsUrl` already exists on the definition, and the detail page links to it.

The audience is operators and developers. `operations.md` is a runbook, and
`security.md` is a threat model. Neither is written for customers, and some of
search engines must not index it.

The public help site is compiled by `fumadocs-mdx` from `packages/content`,
which is translated through Crowdin and served at `/<locale>/help/article/<slug>`
(see the website-content section of `AGENTS.md`). The admin console is behind
the proxy's admin check.

## Options

1. **The public help site,** as a new collection.
2. **The admin console,** as a "Documentation" tab on each integration's detail
   page.
3. **Both.**
4. **Neither:** the files are read on GitHub, and `docsUrl` points there.

## Decision

Option 2.

### How the docs are rendered

- `apps/web/source.config.ts` gains a collection named `integrationDocs`. It
  points `fumadocs-mdx` at `packages/integration-*/docs/*.md`, so the files are
  compiled at build time like the help articles, and Turborepo already
  invalidates the web build when an integration package changes.
- The admin detail page gets a "Documentation" tab:
  - `README.md` is the landing section;
  - the other eight files are its sub-pages;
  - Mermaid blocks are rendered by a client component loaded only on that tab.

### What else changes

- **`docsUrl` keeps its meaning,** but its label changes to "Provider
  documentation": a link to the provider's own documentation.
- **The docs stay in English,** like `AGENTS.md`. They are not part of Crowdin.
- **Customer-facing material is a separate thing.** It goes into
  `packages/content` as help articles when an integration has a customer
  surface, such as a game server's panel login.

## Consequences

- **Operators read the runbook where they act on it,** next to the health status
  and the configuration form.
- **Nothing operator-facing reaches the public site.**
- **The conformance suite stops empty templates.** It checks that the nine
  files exist, that each is longer than its template, and that none still
  contains a `TODO` placeholder. Rendering in the console makes a thin file
  visible too.
- **A broken doc breaks the build.** The `fumadocs-mdx` compile of the docs runs
  during `next build`, which is a reason to keep the docs plain Markdown.
