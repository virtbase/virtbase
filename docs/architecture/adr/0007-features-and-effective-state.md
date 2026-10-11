# ADR 0007: One feature resolver over a cheap, explicit effective state

- Status: Accepted (2026-10-11)
- Date: 2026-10-11
- Requirements: R1

## Context

A disabled integration shows up differently on each surface today:

- The rDNS page is always shown, and its procedure answers 500 when no `dns`
  provider is enabled (`router/servers/rdns.ts`).
- The invoice workflow is always started, and fails fatally without Lexware
  (`orders/fulfill-order.ts`).
- Card and crypto payments depend on environment variables, not the registry.
  Stripe cannot be switched off at all, because `apps/web/src/env.ts` requires
  its keys.
- Discord answers with 404s, hides an account card, and skips notification rows.

Five constraints:

- **The proxy cannot load the registry, and may run in its own process.** It
  imports `@virtbase/auth` directly so that it never loads the registry, which
  imports every integration. In its own process, the registry's in-process
  invalidation never reaches it.
- **The proxy never sees `/api/*`** (`apps/web/src/proxy.ts`, its `matcher`).
  tRPC, route handlers, webhooks and crons have to check for themselves.
- **The customer dashboard layout is a static shell with no session check.**
  Only the proxy can return a real 404 there.
- **Under Cache Components, `'use cache'` outside the static shell is
  per-request in serverless.** A tag revalidation is global on Vercel, but a
  regenerated entry is only as fresh as what it reads.
- **The registry caches configuration for 30 seconds,** and `DbConfigSource` has
  no `onChange`.

## Decision

### Features are declared

```ts
features: {
  "support.discord-bot": {},                        // on when this installation is active
  "billing.invoices": { impliedBy: { port: "invoice" } },  // declared once, by core
  "products.game-server": { impliedBy: { port: "provisioning", kind: "game_server" } },
}
```

- Feature ids are dotted, with segments matching `[a-z][a-z0-9-]*`.
- The internal `core` integration declares the core features. Some are
  `alwaysOn` (`accounts`, `ordering`, `products.server`, `abuse.desk`); the
  rest have an `impliedBy`.
- An integration declares the features that only it enables. It never
  re-declares one that core implies from a port.
- The composition root merges all declarations. Two declarations of one id
  fail the build.

### Effective state is explicit

Each installation is in exactly one state:

| State | Meaning |
| --- | --- |
| `disabled` | the admin switched it off |
| `invalid` | its stored configuration does not validate against the manifest |
| `blocked` | a feature or port in its `requires` is unavailable |
| `active` | none of the above |

- `enabled` is admin intent, and stays as it is.
- A new `config_status` column (`valid` or `invalid`, plus a message) is written:
  - by the admin save, which validates before storing;
  - by the health cron after every deploy;
  - by the registry, best effort, when it meets invalid configuration.
- `blocked` is computed, not stored. Disabling PowerDNS therefore does not
  write anything to Mailcow's row, and re-enabling PowerDNS brings Mailcow back
  with no further step.

### One pure function computes everything

`computeSnapshot(manifests, installations, overrides)` returns:

- the state of every installation;
- every feature with the installations providing it, or the reason it is off.

It reads one narrow query over `integration_installations` (`id`,
`integration_id`, `slug`, `enabled`, `config_status`), plus the `features.disabled`
override setting. It imports manifests only, so the proxy can call it.

Dependency cycles are rejected at composition time by the conformance suite.

### How each caller reads the snapshot

| Caller | How it reads | Freshness |
| --- | --- | --- |
| tRPC, server components, route handlers, crons, jobs, workflows, the outbox | `features.snapshot()`, memoized in-process for 15 s; the instance that made a change invalidates at once | immediate on the writer, 15 s elsewhere |
| the registry (port resolution) | consults the snapshot before building a context; settings and secrets keep their 30 s cache | enablement 15 s; changed credentials 30 s |
| the proxy | the same function and memo, in the proxy's own module scope | 15 s |
| cached UI: navigation in a static shell, public product listings, checkout options | `getFeatureSnapshot()` with `'use cache'`, `cacheTag("features")` and `cacheLife({ revalidate: 60 })`. It reads the database directly, never the memo, so a regenerated entry is never older than the data | the next request on Vercel, after `updateTag("features")` from the admin's server action; at most 60 s self-hosted |

The admin console's configuration mutations are next-safe-action server actions.
That means they can call `updateTag("features")`, and `updateTag("checkout")`
where payment options change. Read-your-own-writes therefore holds for the
admin who flips a switch.

### Every surface asks the same resolver

- **Proxy:** a pure, tested check runs before the existing host rewrites.
  - It maps a path to a feature, using the core route map and the integration
    page declarations ([ADR 0008](0008-integration-pages-and-routes.md)).
  - A disabled feature calls `rewriteToNotFound()`, now with the console locale.
- **tRPC:** every builder reads `meta.feature` and answers `NOT_FOUND`, which a
  client cannot tell apart from an unknown procedure. `requireFeature()` exists
  for conditions inside a procedure.
- **Route handlers and webhooks:** `withFeature(feature, handler)` answers the
  same 404 the webhook dispatcher already uses.
- **Crons and jobs:** a disabled feature is skipped with
  `{ skipped: "feature-disabled" }`, and the run is recorded.
- **Workflows:**
  - Gated workflows check at their first step, so a new run of a disabled
    feature does nothing.
  - A run already in flight finishes. Steps that need a port treat `null` as a
    settled outcome, never as a crash loop.
- **Navigation:** the four hard-coded client menus become server-provided arrays
  of items with an optional `feature`, filtered by the snapshot. Icons become
  keys, mapped on the client.
- **Checkout:** payment methods and product kinds are filtered. A method also
  needs its provider to be `active`, not only enabled.

### Dependencies

`requires: { features?: FeatureId[]; ports?: PortName[]; apiVersion?: string }`.

- **Enabling an installation with unmet requirements is refused.** The admin
  console says which requirement is missing and which installed integrations
  could provide it.
- **Disabling a provider that others depend on asks first.** The confirmation
  lists the dependents that will become `blocked`.
- **A blocked installation:**
  - provides no ports;
  - runs no hooks or jobs;
  - shows its pages as 404;
  - reports health as `error: blocked by <requirement>`;
  - carries a banner on its admin page explaining how to unblock it.

### Admin override

- `features.disabled` is a settings list that can switch a feature off but
  never on. It exists for maintenance windows, such as hiding
  `products.server` from checkout.
- `alwaysOn` features cannot be listed in it.

## Consequences

- **Feature checks never cost a request a database round trip,** except when
  the memo expires.
- **The worst case is written down:** a page can still render for up to 15 s
  after its feature is switched off, on an instance other than the one that
  made the change. A procedure behind it answers `NOT_FOUND` within the same
  window.
- **The integration hub reads one query for all installations.** Today it runs
  one per integration, three times per page.
- **E2E fixtures have to enable what they test.** CI today runs with every
  integration off and without `CONFIG_ENCRYPTION_KEY`. Enable/disable specs
  run serially, as `patches.e2e.ts` does.
