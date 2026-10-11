---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript (TS)

Biome enforces formatting and the rules marked *Biome*. The rest are reviewed.

## Types

**TS-1 No `any`.** Use `unknown`, and narrow it with a Zod parse or a type guard.
*Biome*

**TS-2 Assert types only where the compiler cannot see the type. (defect)**

- Allowed: `as const`, and `satisfies` to check a literal.
- `as unknown as T` is allowed only inside one helper whose TSDoc explains why
  the compiler cannot see the type, as `defineIntegration` does in
  `packages/integration-sdk/src/define-integration.ts`.
- Every other `as` is a defect.

**TS-3 No non-null assertions.** Narrow with a check that throws a named error.

**TS-4 Model alternatives as discriminated unions.**

- The discriminant is a literal `status` or `kind` field.
- Every `switch` over one ends in an exhaustiveness check:
  `const unreachable: never = value`.

**TS-5 Derive types from their source:** `z.output<typeof Schema>`,
`typeof table.$inferSelect`, `ReturnType<typeof fn>`. Never restate a shape by
hand.

**TS-6 Choose `interface` or `type` by what the shape is for.**

- `interface` for contracts that are implemented: ports, contexts, options.
- `type` for unions, mapped types and derived types.

## Modules

**TS-7 Name and place files consistently.**

- File names are kebab-case.
- An operation or orchestrator gets its own file, with private helpers beside it.
- Tests live in `__tests__/` next to the code, named `<file>.test.ts`.

**TS-8 Import in the house style.**

- *Biome:*
  - types through `import type`, in a separate statement;
  - Zod as `import * as z from "zod"`;
  - Node built-ins with the `node:` prefix.
- Import other packages only through their declared `exports`
  (`@virtbase/db/client`, `@virtbase/db/schema`), never by path into their
  `src`.

**TS-9 Keep barrels to public surfaces.**

- An `index.ts` barrel exists only at a package's public entry, or at a feature
  folder's public surface.
- Inside a package, import a sibling module by its file path. The composition
  root imports `../notifications/channels/email` directly for exactly this
  reason, to avoid a cycle.

**TS-10 Use named exports.** A default export is allowed only where a framework
or a contract requires one:

- Next.js route files;
- `defineIntegration` definitions;
- configuration files.

**TS-11 Write functions in the house forms.**

- Domain functions: `export const name = async (…) =>`.
- Workflow and step functions: `export async function`, as every existing
  workflow does.

## Naming

**TS-12 Functions are verbs.** Examples: `transitionOrder`,
`reconcileServerBackup`.

- Predicates start with `is`, `has` or `can`.
- Workflow steps end in `Step`.
- An orchestrator is named for its intent: `settlePayment`, not
  `handlePaymentStuff`.

**TS-13 Constants are UPPER_SNAKE_CASE, with their unit in the name**
(`BACKUP_STALE_AFTER_HOURS`, `REQUEST_TIMEOUT_MS`). A value an operator would want
to change is a setting, not a constant
([env-inventory.md](../architecture/env-inventory.md)).

**TS-14 Zod schemas end in `Schema`** (`GetServerInputSchema`). The type derived
from a schema drops the suffix (`GetServerInput`).

**TS-15 Error classes end in `Error`.** They set `name`, carry `cause`, and expose
a stable `code` when callers branch on the failure. The model is
`ServerManagementError`.

**TS-16 Booleans read as true statements** (`enabled`, `isAlwaysOn`), never as
negations (`notConfigured`).

## Functions

**TS-17 At most two positional parameters.** Beyond two, pass one options object,
destructured in the signature, as `recordCaseEvent({ db, caseId, … })` does.

**TS-18 Never leave a promise floating. (defect)** Every promise is awaited,
returned, or handed to `waitUntil` or `after()`. *Biome in CI: `noFloatingPromises`,
`noMisusedPromises`.*

**TS-19 Every outbound request has a timeout. (defect)**

- `fetch` gets `signal: AbortSignal.timeout(ms)`.
- Integrations use `ctx.http`, which applies the timeout itself.
- A provider SDK is configured with a timeout.

## Errors and logging

**TS-20 Throw only `Error` subclasses.** When wrapping a failure, pass it as
`cause`. Never throw strings or plain objects.

**TS-21 Log with a prefix and structured fields.**

- Integrations log through `ctx.logger`.
- Core code logs through `console.*`, with a bracketed area prefix and a fields
  object: `console.warn("[integrations] …", { integrationId })`. This stays until
  a shared logger exists.
- Never log a secret or personal data ([security.md](security.md)).

**TS-22 Report unexpected failures to Sentry.** Use `Sentry.captureException(error)`
at the boundary that decides the failure is unexpected, not at every layer it
passes through.

## Zod

**TS-23 Validate at every boundary:**

- procedure inputs and outputs;
- server action inputs;
- route and webhook bodies, after verification;
- stored settings;
- the environment.

Schemas shared across packages live in `@virtbase/validators`. A schema used by
one module lives next to it.

**TS-24 Never coerce a boolean from a string. (defect)**

- `z.coerce.boolean()` turns the string `"false"` into `true`. Use
  `z.stringbool()`.
- Treat a blank string as absent, with `z.preprocess` to `undefined`, before
  coercing a number.

**TS-25 Defaults live in the schema** (`.default()`), not in its callers.

## Money, time and identifiers

**TS-26 Money is an integer amount in minor units plus an ISO 4217 currency**
(`Money` in `@virtbase/ports`). Never a float. At a boundary, an amount never
travels without its currency.

**TS-27 Time is a `Date` instant, stored as `timestamptz`.**

- Durations are named constants with their unit.
- A function whose result depends on the time takes `now: Date` (CMP-2).

**TS-28 IDs come from `createId({ prefix })`, and are validated with their
entity's regex.** A new entity adds:

- its prefix to `packages/db/src/utils/create-id.ts`;
- its ID schema to `@virtbase/validators`.

## Runtime

**TS-29 Write for Bun.** Everything runs on Bun, Next.js included.

- Prefer Web platform APIs: `fetch`, `crypto.subtle`, `URL`, `AbortSignal`.
- Use Node built-ins through `node:`.
- Never rely on V8 flags.
