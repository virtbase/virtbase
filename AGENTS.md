# Virtbase Development Guide

> **Note:** `CLAUDE.md` is a symlink to `AGENTS.md`. They are the same file.

## Codebase structure

### Monorepo Overview

This is a bun monorepo containing the Virtbase web app and related packages.

```
virtbase/
├── apps/               # Published apps (website)
├── packages/           # Internal packages with shared logic
│   └── content/        # MDX for the public site (no code)
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
bun check:boundaries   # Architecture layer rules (dependency-cruiser)
```

`check:boundaries` runs dependency-cruiser through bun rather than node, because
dependency-cruiser only supports node `^22||^24||>=26` and refuses to start on
node 25.

## Architecture layering

Imports point downward only. The rules are enforced by `bun check:boundaries`
(see `.dependency-cruiser.jsonc`), not by convention.

| Layer | Packages | May import |
| --- | --- | --- |
| 0 Foundation | `validators`, `utils` | nothing internal |
| 1 Platform | `db`, `auth`, `email`, `ui`, `config` | layer 0 |
| 2 Ports | `ports` | layer 0 only — interfaces, no runtime deps |
| 3 Domain | *(not yet extracted)* | layers 0–2 |
| 4 Integrations | `integration-sdk`, `integration-*` | layers 0–2 |
| 5 Composition | `api`, `apps/*` | everything |

### Adding an integration

An integration is a plug-in that implements one or more capability ports from
`@virtbase/ports`. It must never import `@virtbase/api`, an app, or another
integration.

1. Create `packages/integration-<name>/` depending on `@virtbase/ports` and
   `@virtbase/integration-sdk`.
2. Default-export `defineIntegration({ id, name, description, category,
   settings, secrets, provides, webhooks, health })`. Each entry in `provides`
   is a factory that receives the parsed settings and secrets and returns a port
   implementation. `category` groups it on the admin hub; the optional `icon`,
   `author`, `website` and `docsUrl` fill in its detail page.
3. Register it in `packages/api/src/integrations/index.ts` — the composition
   root and the only file that knows both an integration and a port.
4. Consume it as a capability: `await integrations.resolve("dns")`. Never import
   the integration package from a router or workflow.

`packages/integration-powerdns` is the smallest reference implementation;
`packages/integration-discord` shows webhooks and port consumption;
`packages/integration-stripe` shows a provider whose UI surface deliberately
stays outside its port.

### Webhooks

Entries in `webhooks` are mounted at `/api/integrations/<id>/<path>` by
`apps/web/src/app/api/integrations/[integration]/[...path]/route.ts`. The
handler receives the untouched `Request` — the dispatcher must never read the
body, because signature verification depends on the exact bytes, and verifying
is the integration's job. Unknown, disabled, misconfigured and unknown-path all
return the same 404.

### Consuming ports

Integrations use capabilities as well as provide them:
`await ctx.ports.require("serverManagement")`. This is how
`@virtbase/integration-discord` manages servers without depending on
`@virtbase/api`.

### Message extraction

`apps/web/next.config.ts` lists the directories next-intl scans in
`experimental.srcPath`. An integration package that renders translated strings
must be added there or its whole namespace silently disappears from
`apps/web/src/i18n/messages/en.po` — including when a package is renamed.

Integration name, description and field labels are translated through the
optional `localize()` hook, which resolves its own translator:

```ts
localize: async () => {
  const t = await getExtracted();
  return { name: t("PowerDNS"), fields: { apiKey: { label: t("API key") } } };
},
```

It takes no translator argument on purpose — the extractor only sees literals at
a `getExtracted`/`useExtracted` call site and cannot follow a `t` passed as a
parameter. `name` and `description` on the definition stay untranslated and are
used in logs and health output. `localize()` needs a Next request
context; when it is unavailable the registry falls back to the declared text
rather than failing.

## Website content

Public prose lives in `packages/content`, a workspace package that holds MDX and
no code. `apps/web/source.config.ts` points `fumadocs-mdx` at it and compiles it
into `apps/web/.source` at build time; nothing ever imports the package. It is a
workspace rather than a plain directory so Turborepo tracks it — `@virtbase/web`
depends on it, so editing an MDX file invalidates the web build and typecheck
caches.

Three collections, each loaded in `apps/web/src/lib/source.ts`:

| Collection | Files | URL |
| --- | --- | --- |
| `marketing` | `marketing/<locale>/index.mdx` | `/<locale>` |
| `marketing` | `marketing/<locale>/<slug>.mdx` | `/<locale>/<slug>` |
| `legal` | `legal/<locale>/<slug>.mdx` | `/<locale>/legal/<slug>` |
| `helpArticles` | `help/articles/<locale>/<slug>.mdx` | `/<locale>/help/article/<slug>` |

Locales are **directories**, not filename suffixes, so Fumadocs is configured
with `parser: "dir"`. That is the only layout Crowdin can map onto a translation
path — it has no placeholder that strips `.en` from the middle of a filename.

The home page is `marketing/<locale>/index.mdx`. Its prose is MDX rather than
next-intl messages. Anything backed by live data — plans, prices, specs — stays
a component and is never copied into MDX, or it goes stale.

### Marketing blocks

The components a marketing document may use are registered in
`apps/web/src/ui/mdx/marketing-components.tsx`. Nothing else is in scope.

| Block | Body | Notes |
| --- | --- | --- |
| `<Hero>` | `#` heading + paragraph | `h1` is rendered unanchored |
| `<Offers />` | — | plans and prices from the database |
| `<OperatingSystems />` | — | distro logos |
| `<Features>` / `<Feature>` | prose | `title`, `demo`, optional `href` |
| `<Advantages>` / `<Advantage>` | prose | `title`, `icon`, optional `href` |
| `<Faq>` / `<Question>` | prose | `title`; also emits `FAQPage` JSON-LD |

Two conventions hold across the blocks:

- **Short labels are attributes, prose is the body.** A heading or a question is
  a `title` attribute; everything longer is Markdown inside the block, so it can
  carry links and emphasis. `FAQSection` flattens answer Markdown with
  `toPlainText` for the structured data, so an answer is never written twice.
- **`icon` and `demo` are names, not components.** MDX picks from a fixed map so
  a document cannot import arbitrary React.

Links inside MDX carry their own locale prefix (`/de/legal/privacy`), matching
the help and legal articles. The `href` attribute on a block is different — it
goes through `IntlLink` and must stay unprefixed (`/help/article/...`).

### Locales and the fallback

`source.ts` builds each collection twice. The exported loaders keep the default
`fallbackLanguage`, so a document with no file for the requested locale serves
the source locale instead of a 404. A second, private set of loaders sets
`fallbackLanguage: null`, and `getDocumentLocales()` reads those — it is the
only way to ask which translations really exist, because `getPages()` on a
loader with a fallback reports every locale whether or not the file is there.

`hreflang` and the sitemap must use `getDocumentLocales()`. Advertising a locale
that silently serves English is worse than advertising nothing.

## Configuration platform

Integration configuration lives in Postgres, not in the environment.

- `integration_installations` holds the enabled flag and non-secret settings.
- `integration_secrets` holds AES-256-GCM ciphertext. Each installation has its
  own data key, wrapped with the bootstrap `CONFIG_ENCRYPTION_KEY`, so rotating
  that key rewraps one short string per installation and touches no ciphertext.
- `settings` holds application settings keyed by dotted namespace.

`DbConfigSource` is the only source. An integration with no row is off — there
is no environment fallback, and no `env` hint on field descriptors. Configure
integrations in the admin console; a fresh database therefore starts with
everything disabled, which includes local development after a reset.

Without `CONFIG_ENCRYPTION_KEY` there is no way to read a stored secret, so
`DisabledConfigSource` reports every integration as off and logs a warning. The
application still boots and serves. Generate a key with
`openssl rand -base64 32`.

Some credentials are still read from the environment because application code
outside the registry reads them directly: `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` (the module-level client, checkout, the webhook route),
the four `ANONPAY_*` variables (checkout and the webhook route), and
`DISCORD_APP_ID` / `DISCORD_BOT_TOKEN` (the build-time registration scripts, the
linked-role route, and the login scope decision). Those consumers have to move
behind a port before the variables can go.

The admin console has a hub at `/admin.virtbase.com/integrations`, grouped by
category, and a detail page at `/integrations/<id>` with the enable switch,
health, and the configuration form. Forms are generated from each integration's
field descriptors, so a new setting needs no form code.

Secrets are write-only: the page shows which keys are set and never their
values, and a blank field means "leave unchanged". Integrations marked
`internal` — capabilities the platform provides rather than plug-ins anyone
installs — are hidden from the hub.

`/api/cron/check-integration-health` probes every enabled integration and stores
the result, so the status shown in admin is not just whatever the last person to
press "Check now" saw. Cron schedules live in `apps/web/vercel.json`.

## Server backups

A backup is a Proxmox `vzdump` task. `servers.backups.create` starts it and
stores a row with the task's UPID; the archive's `volid`, size and finish time
are only known afterwards, so the row starts out unsettled
(`finished_at IS NULL`).

Settling that row is `reconcileServerBackup()` in `packages/api/src/backups`,
and it is the only place that writes a terminal state. It runs from three
callers:

- `servers.backups.status.get`, polled by the backups page,
- `servers.backups.create` and `.delete`, before they act on the backup state,
- `/api/cron/reconcile-server-backups`, every ten minutes.

The cron is what makes the rest safe. An unsettled row blocks every further
backup of its server and can be neither deleted nor restored, so a backup that
is only ever reconciled by a browser is a backup that strands the moment the
customer closes the tab. Reconciliation is therefore total: every branch either
settles the backup or leaves it for the next run, and a task that can no longer
be resolved at all is marked as failed once it is older than
`BACKUP_STALE_AFTER_HOURS`. Proxmox failures are reported to Sentry and
swallowed - an unreachable node must never fail the caller.

`failed_at` implies there is no archive on the node: a hard `vzdump` error
writes none, and an exit status of `WARNINGS: n` is treated as a success as
long as the archive carrying the backup's id is on the storage. Deleting a
failed backup therefore only drops the row.

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

