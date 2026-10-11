# ADR 0008: Integration pages mount through one catch-all per surface, and the proxy decides the 404

- Status: Accepted (2026-10-11)
- Date: 2026-10-11
- Requirements: R1, R3, R7

## Context

Next.js routes are files, so an integration cannot add a route folder. Five
facts from the current code set the shape of the answer:

- **Cache Components send the static shell before a page runs.** `notFound()`
  in a page therefore produces a soft 404. Real 404s are decided in the proxy:
  `missing-content.ts` and `rewriteToNotFound()` for the public host, and the
  admin host's rewrite for non-admins.
- **The two dashboards differ.** The admin `(dashboard)` layout is
  `instant = false` and blocks on `verifyRenderSession()`. The customer
  dashboard layout has no session check and is entirely static shell, so only
  the proxy can answer 404 there.
- **The proxy skips paths it cannot serve as pages.** Its matcher excludes
  `/api`, `/_next` and any path containing a dot. A download such as
  `report.csv` must therefore be a route handler under `/api`, and that handler
  has to check access itself.
- **Navigation is hard-coded.** All four menus are client-side arrays of Lucide
  components.
- **Translation depends on extraction.** Only packages listed in
  `experimental.srcPath` are extracted. Stripe and Anonpay are missing from it
  today, and nothing tests that the list is complete.

## Decision

### Declarations

Pages are declared in the integration's `manifest` entry
([ADR 0003](0003-manifest-v2.md)) as plain data:

```ts
pages: [
  {
    surface: "admin",
    path: "exports",                    // below the integration's mount point
    icon: "file-spreadsheet",           // a key, mapped to a component in apps/web
    nav: { section: "billing", order: 40 },
    feature: "billing.accounting-export",
    access: { role: "admin", stepUp: false },
  },
],
```

Titles and navigation labels come from the integration's `localize()`
([ADR 0018](0018-translation-standard.md)).

### Components

Components live in `@virtbase/integration-<id>/ui`. `apps/web/src/integrations/pages.ts`
maps them with static `import()` calls, one per page, so each page is its own
chunk and no other route loads it:

```ts
export const integrationPages = {
  lexware: { admin: { exports: () => import("@virtbase/integration-lexware/ui/admin/exports") } },
} satisfies IntegrationPageMap<typeof manifests>;
```

The `satisfies` clause makes a declared page without a component, or a
component without a declaration, a type error.

### Routes

| Surface | Route | Notes |
| --- | --- | --- |
| admin | `admin…/[locale]/(dashboard)/integrations/[id]/[...page]` | under the blocking admin layout |
| customer | `app…/[locale]/(dashboard)/integrations/[id]/[...page]` | standalone pages, which are rare |
| customer | `app…/[locale]/(dashboard)/services/[serviceId]/[[...tab]]` | a service's detail pages, rendered by its provider (Phase 6, [ADR 0012](0012-products-and-services.md)) |

For a multi-instance integration, the first page segment is the installation
slug ([ADR 0002](0002-several-installations-per-integration.md)).

### What the catch-all does

1. It resolves the page from the map.
2. It re-checks access on the server, using the session and the feature
   snapshot. This is defence in depth: the proxy has already decided.
3. It renders the integration's component inside a Suspense boundary.
4. It passes the component typed props:
   - the installation;
   - the locale;
   - a server-side tRPC proxy scoped to `integrations.<id>`
     ([ADR 0009](0009-integration-procedures.md)).

The shell — page title, navigation and breadcrumbs — must stay instant, and an
`instant()` Playwright test guards it. That requires adding
`@next/playwright`, which is not installed today.

### The proxy decides the 404

A new pure function, `resolveConsoleRoute(host, pathname, snapshot, session)`,
runs before the existing console rewrites. It imports manifests only. It
rewrites to the not-found page, with the console's locale, when:

- the integration or the page is unknown;
- no installation is `active` (for a multi-instance integration: the named
  slug is not);
- the page's feature is off;
- the session's role does not satisfy `access.role`. The admin host already
  enforces this for every admin page; the check extends it to role-restricted
  customer pages.

`access.stepUp` is not a 404 case. The page renders its shell and asks for
step-up the way the customer privacy pages already do (`StepUpDialog`).

### Route features for core pages

The proxy needs the same check for core pages that belong to a feature, such as
`/servers/[id]/rdns` (`dns.reverse`) and `/invoices` (`billing.invoices`).
`ROUTE_FEATURES` maps console segments to features. A filesystem test, modelled
on the `ROUTED_SEGMENTS` test, fails when a console route folder is not listed,
either with its feature or explicitly with `null`.

`ROUTED_SEGMENTS` and its test only change if an integration ever declares a
public-host page. That is not proposed.

### Route handlers

Route handlers are declared in the runtime definition. They are mounted outside
the webhook namespace:

| Path | Who |
| --- | --- |
| `/api/admin/integrations/<id>/<path>` | admin routes |
| `/api/app/integrations/<id>/<path>` | customer routes |
| `/api/integrations/<id>/<path>` | webhooks, unauthenticated, unchanged |

Each handler is wrapped by the SDK's route builder, which runs before
integration code. The builder:

- reads the session without the cookie cache, so that a demoted admin is
  refused at once rather than within five minutes;
- checks the role, the feature and the installation state;
- applies step-up.

### Step-up for downloads

A browser download cannot react to a 403 by showing a dialog. A route that needs
step-up therefore works in two calls:

1. A step-up-guarded mutation issues a single-use download token. It is stored
   in Redis for 60 s and bound to the user, the session, the route and its
   parameters.
2. The route redeems the token with `GETDEL`.

The route fails closed when Redis is unreachable. The existing `once()` helper
fails open, so it is not used for this.

### Extraction completeness

A new test lists every `packages/integration-*` directory containing a
`getExtracted` or `useExtracted` call. It fails unless each one is in
`experimental.srcPath`. Stripe and Anonpay are added to the list when they gain
translated strings in Phase 1.

## Consequences

- **The page map is the only place `apps/web` knows an integration's
  components.** Removing an integration means deleting its entry, and the type
  check finds what is left.
- **Each surface needs a new folder, and the tests above** (the `ROUTE_FEATURES`
  filesystem test, the srcPath test).
- **Navigation moves to the server.** The admin menu groups become sections
  that integration pages can join.
- **The proxy gains one memoized query and a manifest import,** but no
  integration runtime code.
- **Bundles have to be measured.** Client components in one integration page
  must not end up in a shared chunk. Each phase that adds a page runs the
  `next-bundle-optimizer` checks and compares the shared chunks with the
  previous build.
