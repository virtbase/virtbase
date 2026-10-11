# ADR 0018: One translation path for everything an integration shows to people

- Status: Accepted (2026-10-11)
- Date: 2026-10-11
- Requirements: R3, R6

## Context

Integrations translate text in four different ways today:

1. **`localize()`** in seven packages uses `getExtracted()` with no namespace.
   Its strings land in the root namespace of
   `apps/web/src/i18n/messages/<locale>.po`, and are shared across packages:
   "API key" is a single entry used by three of them.
2. **The Discord bot UI** makes 39 `getExtracted({ namespace: "discord-integration", locale })`
   calls inside webhook handlers. Those strings are in the `.po` files and go
   through Crowdin.
3. **Discord's command descriptions and role-connection names** are hand-written
   TypeScript maps for 18 Discord locales. They are pushed to Discord by its
   sync, and are neither extracted nor in Crowdin.
4. **Lexware's invoice copy** uses `use-intl`'s `createTranslator` over its own
   `messages.ts`, in four locales, outside Crowdin.

On top of that:

- Core notification text uses the email JSON catalogues.
- Notification-target field labels, select-option labels and every placeholder
  are English literals.
- Stripe and Anonpay are not in `experimental.srcPath`, and their admin text is
  English.

Two constraints:

- **The extractor only sees literals** at a `getExtracted` or `useExtracted`
  call site, and only scans `experimental.srcPath`.
- **Locale lists differ.** There are 17 `.po` catalogues; the app enables four
  locales. Discord uses 18 locale codes, with regional variants such as
  `es-419`, `pt-BR` and `sv-SE`.

## Decision

### Every string goes through next-intl and Crowdin

Every string an integration shows to a person goes through next-intl extraction
into the `.po` catalogues and through Crowdin. Each integration has its own
namespace, `<id>-integration`, following the Discord precedent, so ownership and
completeness can be checked per integration. Crowdin's translation memory fills
strings that move out of the root namespace, so nothing is translated twice.

### Server-side text comes from `localize()`, typed from the manifest

```ts
localize: async () => {
  const t = await getExtracted({ namespace: "lexware-integration" });
  return {
    name: t("Lexware Office"),
    description: t("Issues invoices through Lexware Office."),
    fields: { apiKey: { label: t("API key"), help: t("Created under Settings → Public API.") } },
    features: { "billing.accounting-export": { name: t("Accounting export") } },
    pages: { exports: { title: t("Exports"), nav: t("Accounting exports") } },
    events: {},
    errors: { "lexware.rate_limited": () => t("Lexware is rate limiting us. Try again in a minute.") },
  };
},
```

- Its return type is derived from the manifest's literal types. A declared field,
  option, page, feature, event or error code without an entry is a type error.
- The conformance suite checks the same thing at runtime, as a second line.

### Client-side text in the `/ui` entry uses `useExtracted`

It uses the same namespace, as the app does.

### Text an integration pushes elsewhere is rendered from the same catalogue

This covers Discord command descriptions, role-connection metadata and Lexware
invoice copy.

- The integration calls `getExtracted({ namespace, locale })` once per target
  locale, inside its sync or its workflow step.
- A small table in the SDK maps the target's locale codes onto `.po` locales:
  `es-419` and `es-ES` to `es`, `pt-BR` to `pt`, `sv-SE` to `sv`, `en-GB` to
  `en`.
- The hand-written maps and `messages.ts` are deleted when their strings are in
  the catalogue.

### Errors are translated on the server

The procedure and route wrappers translate them using the request's locale
([ADR 0009](0009-integration-procedures.md)). Outside a request, the English
message is used.

### Tests

- **Declarations are complete.** The conformance suite runs `localize()` with
  `next-intl/server` replaced by a recording translator. This uses
  `mock.module`, so every integration package runs its tests with `--isolate`.
  It fails when an entry is missing.
- **Strings are extracted.** A test in `apps/web` reads `en.po` and fails when a
  string `localize()` returns is not present under the integration's namespace.
  That catches a package missing from `srcPath` and stale catalogues.
- **`srcPath` is complete.** This test is new; it does not exist today. It fails
  when a package that calls `getExtracted` or `useExtracted` is not in
  `experimental.srcPath` ([ADR 0008](0008-integration-pages-and-routes.md)).

## Consequences

- **Translators gain a few hundred strings in Phase 1:**
  - Discord's command and role-connection text;
  - Lexware's invoice copy;
  - field help, placeholders and option labels;
  - Stripe and Anonpay.
- **Phase 1 checks one assumption first:** that `getExtracted({ locale })` works
  inside a workflow step, for invoice copy. Discord's webhook handlers already
  prove it inside route handlers.
- **The import order stays fragile.** Integration packages import
  `next-intl/server` at module scope, and that is what forced
  `i18n/request.ts` to defer its `auth` import. The standard keeps static
  imports, because the extractor needs them. The deferred import stays, with a
  test that builds the request config without loading the registry.
