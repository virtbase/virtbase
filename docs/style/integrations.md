---
paths:
  - "packages/integration-*/**"
  - "packages/ports/**"
---

# Integration packages (INT)

The contract is defined in the ADRs:

- the manifest: [0003](../architecture/adr/0003-manifest-v2.md);
- data: [0010](../architecture/adr/0010-integration-data.md);
- pages: [0008](../architecture/adr/0008-integration-pages-and-routes.md);
- procedures: [0009](../architecture/adr/0009-integration-procedures.md);
- translations: [0018](../architecture/adr/0018-translation-standard.md).

These rules are what review checks. Once Phase 1 ships the SDK's `docs/`, the SDK
authoring guide is the reference, and this page links to it.

## Boundaries

**INT-1 An integration depends only on Layer 0–2 packages and its own code.
(defect)**

- It never imports `@virtbase/api`, an app, or another integration.
- It never imports `@virtbase/db/schema`. Core data reaches it through ports.
- `bun check:boundaries` enforces this.

**INT-2 Each entry point holds one kind of thing:**

| Entry point | Holds |
| --- | --- |
| `./manifest` | static data and Zod schemas only |
| the runtime root | factories, hooks, handlers |
| `./ui` | components |
| `./schema` | Drizzle tables |

A client component imports `./ui` only.

**INT-3 Core code reaches an integration only through ports and the registry.**
Adding an integration is one entry in the composition root, and one entry in the
page map if it has pages.

## Inside an integration

**INT-4 Outbound HTTP goes through `ctx.http`.** It applies the timeout, the
retry policy and redaction. A provider SDK gets the same timeout and retry
settings. Calling `fetch` directly is a defect.

**INT-5 Errors are `IntegrationError`s** with stable `<id>.<reason>` codes. Each
code has a translated message in `localize().errors`. Provider errors are
translated in the adapter, never passed through raw.

**INT-6 Log with `ctx.logger`.** `console.*` is not used in integration code.

**INT-7 Settings and secrets are declared once,** in the manifest, as a Zod schema
plus field descriptors.

- A secret uses the `password` widget, and never appears in a log, an error, an
  event or a client prop.
- A changed settings schema ships a settings migration.

**INT-8 Health probes are side-effect free and bounded.**

- No writes at the provider, and no paid quota.
- The budget is 5 seconds by default.
- `ok`, `degraded` and `error` have the meanings in
  [ADR 0003](../architecture/adr/0003-manifest-v2.md).

**INT-9 Every hook declares its policy:** phase, failure policy, timeout and
priority.

- A hook inside a transaction does no network I/O.
- An `after` hook is idempotent on its `idempotencyKey`.

**INT-10 Owned tables follow the conventions in
[ADR 0010](../architecture/adr/0010-integration-data.md):**

- names prefixed `int_<id>_`;
- an `installation_id` column;
- `@virtbase/db/refs` for foreign keys to core;
- privacy handlers when the data is personal.

**INT-11 Every visible string is translated** in the `<id>-integration` namespace,
and the package is listed in `experimental.srcPath`.

## Definition of done

**INT-12 An integration is done when:**

- the conformance suite passes;
- the contract suite passes for each port it provides;
- coverage is at least 80 % of lines and functions;
- `docs/` holds the nine required files;
- its E2E specs pass: configure, enable, use, disable with a real 404.

The gates themselves are listed in
[integration-first.md §13](../architecture/integration-first.md#13-quality-gates).
