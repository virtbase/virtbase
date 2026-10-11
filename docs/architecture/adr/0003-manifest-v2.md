# ADR 0003: Manifest v2, split across four entry points, first-party only

- Status: Accepted (2026-10-11)
- Date: 2026-10-11
- Requirements: R3, R6, R7

## Context

`IntegrationDefinition` (`packages/integration-sdk/src/types.ts`) describes
identity, settings, secrets, port factories, webhooks, `onEnable`, `onDisable`,
`localize` and `health`. It has no version, features, dependencies, event hooks,
pages, procedures, routes, tables, jobs or privacy hooks.

`defineIntegration()` is a cast, and the registry stores definitions with their
types erased. Five problems follow from how the definition is packaged today:

- **Some surfaces load more than they need.** The proxy needs to know which
  pages exist, but it must not load integration runtime code. Today it imports
  `@virtbase/auth` directly so that it never reaches the registry, which
  imports every integration (`apps/web/src/lib/middleware/utils/read-session.ts`).
- **An integration definition ships to the browser.** A client component
  imports the Anonpay barrel, so the definition and its Zod schemas reach
  customers (`apps/web/src/features/checkout/components/elements-provider.tsx`).
- **`onDisable` never runs.** The admin action stores `enabled = false` first,
  and the registry builds no context for a disabled integration.
- **There is no common standard for outbound HTTP.** No integration sets a
  request timeout. Two leak a secret into error messages: Anonpay's webhook
  secret through a query string, and Discord's interaction token through
  `DiscordApiError`.
- **Health has no time budget.** `registry.health()` runs every probe in one
  `Promise.all`, and "Check now" probes every integration, not the one asked
  about.

## Decision

### The manifest is versioned

Every integration declares `apiVersion: 2`, the SDK contract it was written
against, and a semver `version` of its own. `requires.apiVersion` states the
range of core contracts it supports, and a mismatch fails at composition time.
An integration that changes its settings schema ships a settings migration
with it. The registry applies the migration when it reads the settings, and the
next save writes the migrated value, with an audit entry.

### The package has four entry points

| Entry | Contains | May import | Imported by |
| --- | --- | --- | --- |
| `@virtbase/integration-<id>/manifest` | static data: identity, links, docs path, `multiInstance`, `requires`, the names of the ports it provides, features, declared events, settings and secrets descriptors, data requirements, page declarations, job schedules | `@virtbase/integration-sdk/manifest`, `@virtbase/ports` types, `@virtbase/events/catalog`, validators, utils, zod | the proxy, the feature resolver, the composition root, the conformance suite |
| `@virtbase/integration-<id>` | `defineIntegration(manifest, runtime)`: port factories, hooks, webhooks, routes, procedures, job handlers, privacy, health, lifecycle, `localize` | anything Layer 4 may import | the composition root only |
| `@virtbase/integration-<id>/ui` | page components, server and client | `@virtbase/ui`, `@virtbase/integration-sdk/ui`, its own manifest | the composition map in `apps/web` (static `import()`) |
| `@virtbase/integration-<id>/schema` | Drizzle tables, if it owns any | `@virtbase/db/refs`, drizzle-orm | drizzle-kit, `createTestDb`, the integration's own runtime |

`defineIntegration(manifest, runtime)` keeps the manifest's literal types. The
composition root can therefore derive the union of feature names and the type
of `integrations.<id>` procedures without casting. The registry still stores
erased definitions, because it is dynamic.

### The SDK defines one standard for each cross-cutting concern

- **Errors.** `IntegrationError` carries a stable `code` (`<integration>.<reason>`),
  `retryable`, `params` for the message and an optional `cause`. The integration's
  `localize()` maps every code to a translated message. It replaces `PortError`
  for integration code. `PortError` stays as the port-level type that adapters
  translate into.
- **Outbound HTTP.** `ctx.http` wraps `fetch`:
  - a timeout on every request (10 s by default; each call may lower it, and the
    manifest may raise it to at most 30 s);
  - retries with full jitter, for idempotent methods only;
  - redaction of every declared secret value and of query strings in errors and
    logs;
  - a Sentry breadcrumb for each request;
  - a refusal to run inside a database transaction ([ADR 0005](0005-hook-phases.md)).
  Provider SDKs that bring their own client (Stripe) are configured with the
  same timeout and retry policy.
- **Health.**
  - `ok`: the provider answered and the configuration works.
  - `degraded`: it works with a reduced capability, for example a quota nearly
    used up or a feature not provisioned at the provider.
  - `error`: it does not work.
  A probe has a budget (5 s by default, at most 15 s). The registry enforces the
  budget and reports a timeout as `error`. A probe must not change anything at
  the provider and uses no paid quota. "Check now" probes one
  installation.
- **Logging.** `ctx.logger` writes structured fields and prefixes every line with
  the integration and installation. It redacts secrets the same way `ctx.http`
  does. Integration code does not call `console.*`.

### Lifecycle hooks always get a context

`onInstall`, `onEnable`, `onDisable` and `onUninstall` receive a context built
from the stored configuration whether or not the installation is enabled. The
admin flow runs `onDisable` before it stores `enabled = false`.

### Integrations are first-party

They are workspace packages compiled into the app. The manifest describes them;
it does not contain them. Loading third-party integration code at runtime is out
of scope. The SDK documentation says so, so that nobody reads the manifest as a
sandbox.

## Consequences

- **Every integration is migrated in Phase 1,** and the v1 types are deleted
  when the last one moves. There is no compatibility layer to maintain.
- **`.dependency-cruiser.jsonc` gains two rules:** one for the purity of the
  `manifest` entry, and one restricting what the `ui` entry may import. The
  rule that client components may only import `/ui` entries cannot be expressed
  in dependency-cruiser, because it cannot see `"use client"`. A test enforces
  it instead.
- **The proxy and the feature resolver import manifests only.** They therefore
  never load Stripe's SDK or Discord's handlers.
- **Fixes along the way.** Health timeouts, "Check now" probing one
  installation, and `onDisable` running before the flag changes all land in
  Phase 1 as behaviour fixes. The PR description says so.
