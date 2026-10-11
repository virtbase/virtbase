---
paths:
  - "apps/web/src/**/*.tsx"
  - "apps/web/src/app/**"
  - "apps/web/src/proxy.ts"
  - "apps/web/src/lib/middleware/**"
  - "packages/ui/**"
---

# Web app: Next.js, React, i18n, UI (WEB)

Next.js 16 runs on Bun with Cache Components and Partial Prefetching enabled.
Six Next.js skills are installed in `.claude/skills/` (from `vercel/next.js`). Load
the matching skill before changing caching, prefetching, bundles, or before
verifying behaviour in a running app.

## Structure

**WEB-1 Route files are thin.** `page.tsx`, `layout.tsx` and `route.ts` do three
things:

- read their params;
- call a data fetcher or prefetch;
- render feature components.

Where the rest of the code goes:

| Code | Location |
| --- | --- |
| feature code | `apps/web/src/features/<domain>/{api,components,lib}` |
| shared app UI | `apps/web/src/ui` |
| design-system primitives | `@virtbase/ui` |

**WEB-2 Server components by default.**

- `"use client"` goes on the leaf that needs state, effects or browser APIs, and
  nowhere above it.
- Props that cross into a client component are serialisable.

**WEB-3 A client module reads no environment and imports no server code.
(defect)**

- A configuration value a client needs, such as the Stripe publishable key, is
  read by a server component and passed down as a prop.
- A client component imports an integration package only through its `/ui`
  entry. Today's Anonpay import in `elements-provider.tsx` is the counterexample.

## Rendering and caching

**WEB-4 Every piece of data goes to the cache that matches who sees it.**

| Data | Where it goes |
| --- | --- |
| differs per request | a `<Suspense>` boundary with an inert fallback |
| shared by everyone | `"use cache"` with a `cacheTag` |
| per user | `"use cache: private"` |

To invalidate a tag:

- `updateTag(tag)` in a server action;
- `revalidateTag(tag, "max")`, or `{ expire: 0 }`, in a route handler. The
  one-argument form is deprecated.

**WEB-5 Real 404s are decided in the proxy.** These are decided before anything
renders:

- unknown paths;
- disabled features;
- missing roles.

The tools are `rewriteToNotFound()`, `ROUTED_SEGMENTS` and `ROUTE_FEATURES`.
`notFound()` in a page answers HTTP 200. It is allowed only for an entity that
does not exist or does not belong to the user, inside an authenticated dashboard.

**WEB-6 Keep navigation instant.**

- `export const instant = false` needs a reason in the PR description.
- A navigation that must stay instant gets an `instant()` Playwright test, once
  `@next/playwright` is added in Phase 5.

## Data and mutations

**WEB-7 Reads follow the surface:**

- the admin console uses data fetchers in `features/admin/api` that call
  `verifySession()`;
- the customer dashboard prefetches tRPC in the server component and wraps it in
  `HydrateClient`. Client components call `useTRPC()`.

**WEB-8 Writes follow the surface:**

- the admin console writes through server actions ([SRV-5](server.md#server-actions-admin-console));
- the customer dashboard writes through tRPC mutations.

Every write shows its failure to the user, and every destructive write asks for
confirmation first.

## Internationalisation

**WEB-9 Every visible string is translated at its call site.**

- It goes through `getExtracted` or `useExtracted`, with the literal string at
  the call site.
- Never pass a translator function as a parameter: the extractor only sees
  literals at the call site.
- Never build a sentence from translated fragments; use ICU placeholders and
  plurals.
- Numbers, dates and money are formatted with next-intl's formatters.

**WEB-10 A package that renders translated strings is listed in
`experimental.srcPath`,** through `MESSAGE_SOURCE_PATHS` in
`apps/web/src/i18n/source-paths.ts`. `source-paths.test.ts` fails otherwise.

**WEB-11 Commit the regenerated `.po` catalogues with the change.** CI fails when
they are not committed. Non-English catalogues are edited only through Crowdin.

## UI

**WEB-12 Build from the design system.**

- Use the `@virtbase/ui` components, built on `radix-ui`.
- Style with Tailwind classes, combined with `cn` from `@virtbase/ui`.
- Use icons from `lucide-react`.
- Inline styles are allowed only for values computed at runtime.

**WEB-13 Every control is accessible.**

- Every interactive element has an accessible name: a visible label, or
  `aria-label`.
- No state is shown by colour alone.
- Every dialog returns focus to the element that opened it.

**WEB-14 Navigation is data.** From Phase 3, menus are server-provided items with
an optional `feature`, and icons are keys. Never hard-code a menu entry for a
page that belongs to a feature.

## Proxy

**WEB-15 Proxy logic lives in pure, tested helpers** under
`apps/web/src/lib/middleware`.

- The proxy imports manifests only, never the integration registry.
- Its database work is limited to two documented reads:
  - the admin session fallback;
  - the memoised feature snapshot
    ([ADR 0007](../architecture/adr/0007-features-and-effective-state.md)).

## Metadata

**WEB-16 Page metadata goes through `constructMetadata`** from `@virtbase/utils`.
Brand and company values in metadata and JSON-LD come from settings from
Phase 2.4 on.
