---
paths:
  - "packages/api/src/**"
  - "apps/web/src/app/api/**"
  - "apps/web/src/features/*/api/**"
---

# Server code: procedures, actions, routes, crons, workflows, events (SRV)

All of these are orchestrators ([composition.md](composition.md)): they
authenticate, validate, open the transaction, call operations, and order the
side effects. Business decisions live in the operations and decisions they call.

## tRPC procedures

**SRV-1 Procedures are thin.** A procedure body does five things:

1. it validates input with the procedure's schema;
2. it relies on its builder for authentication and ownership;
3. it calls one operation or orchestrator function;
4. it maps the result to the output schema;
5. it translates errors once.

Business logic in a procedure body is moved into an operation the next time the
procedure changes.

**SRV-2 Every procedure declares both schemas.**

- Inputs and outputs come from `@virtbase/validators`, and the output is
  validated.
- A public procedure carries its OpenAPI `.meta()`.

**SRV-3 Authorise in the builder, not in the body.**

- `serverProcedure` checks server ownership; `stepUpProcedure` checks step-up.
- Phase 3 adds `adminProcedure` and `meta.feature`
  ([ADR 0007](../architecture/adr/0007-features-and-effective-state.md)).
- A body that checks roles by hand is a defect.

**SRV-4 Errors reach the client as `TRPCError` codes,** with messages safe to show.
An expected outcome (`NOT_FOUND`, `CONFLICT`, `PRECONDITION_FAILED`) is never
logged as an error.

## Server actions (admin console)

**SRV-5 Admin writes are next-safe-action server actions:**

- in `apps/web/src/features/admin/api/<domain>/`;
- built with `actionClient`;
- validated with a Zod schema;
- calling a domain function.

They invalidate with `revalidatePath`, or `updateTag` once the data is tagged
(Phase 3). Sensitive actions use the step-up action client from Phase 2.3.

**SRV-6 An action re-reads the session for writes** (Phase 2.3), and never trusts
the five-minute cookie cache for a write.

## Route handlers and webhooks

**SRV-7 Authenticate before anything else.** The order is:

1. the cron secret (`withCronSecret`), the session, or the provider signature;
2. parsing;
3. the operation.

The proxy never sees `/api`, so a route handler is its own last line of defence.

**SRV-8 A webhook never reads the body before verification.** It records
provider event IDs in an idempotency ledger (`payment_events` is the model). It
answers quickly, and moves slow work to `after()` or a workflow.

## Crons

**SRV-9 Every cron route follows the same shape. (defect)** It is a GET behind
`withCronSecret`, with an explicit `maxDuration`. From Phase 3 it is gated by
`withFeature()`. It:

- selects a bounded batch;
- processes it with bounded concurrency ([CMP-7](composition.md#rules));
- isolates every item's failure;
- returns counts: `{ processed, settled, failed, skipped }`.

**SRV-10 A cron is a reconciler** ([CMP-8](composition.md#rules)). Running it twice,
or in parallel with itself, is harmless.

## Workflows

**SRV-11 A workflow keeps the existing layout:**

- `index.ts` holds the `"use workflow"` function;
- each `"use step"` lives in its own file, as an `export async function …Step`.

**SRV-12 Never move or rename an existing workflow or step file. (defect)** Step
IDs embed the module path, so runs in flight would lose their steps. New
behaviour goes into new files.

**SRV-13 Inputs are references, never secrets. (defect)** Pass IDs. A step loads
credentials and configuration inside itself, because inputs and results are
stored in the workflow event log.

**SRV-14 The workflow function does no I/O.** It is replayed. Settings, time and
randomness are read inside steps.

**SRV-15 Every step can be repeated** ([CMP-6](composition.md#rules)).

- Provider calls pass `getStepMetadata().stepId` as their idempotency key.
- Database writes are guarded or claimed.
- Events carry the step's dedupe key (Phase 4).

**SRV-16 Classify failures.**

- `FatalError` for failures a retry cannot fix.
- `RetryableError` with `retryAfter` for transient ones.
- Compensations are registered with `runRollbacks`.
- A failure that must not fail the run goes through `reportSwallowedFailureStep`.

**SRV-17 Starting a workflow is idempotent.** `start()` is not part of the
database transaction. A start that may be repeated uses a deterministic hook
token or a claim row. A start that may be lost is covered by a reconciler, as
`reconcileOrders` covers fulfilment.

## Events and hooks (Phase 4 on)

**SRV-18 State changes emit their catalogue event in the same transaction.**
Side effects become `after` subscribers. The phases and their limits are in
[ADR 0005](../architecture/adr/0005-hook-phases.md).

**SRV-19 Events carry references and classified fields, never secrets.** That
rules out tokens, passwords, OTPs, reporter identity and anything else that is a
credential. Each payload field has a PII level
([ADR 0004](../architecture/adr/0004-event-catalogue-package.md)).

**SRV-20 Events do not orchestrate the core.** The order flow, provisioning and
renewals stay explicit workflows. Events tell others what happened.

## Integrations from core code

**SRV-21 Ask for capabilities, not integrations.**

- `await integrations.resolve("dns")` returns `null` when the capability is off,
  and the caller handles it as "feature off", never as a crash.
- Core code never imports an integration package
  ([integrations.md](integrations.md)).
