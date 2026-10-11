---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# Composable code (CMP)

Code here is built from small units. Each unit:

- does one thing;
- receives everything it touches as a parameter;
- can be combined by its caller without surprises.

This guide defines those units and the rules that keep them combinable. Its last
section says what to do when the code next to your change does not follow them.

## The four kinds of unit

| Kind | What it does | I/O | Transaction | Today's examples |
| --- | --- | --- | --- | --- |
| **Decision** | computes a result from plain data | none | none | the transition map in `packages/api/src/lib/order-status.ts`; `isDetectionStale()` in `packages/api/src/guest-os` |
| **Operation** | performs one state change and records what happened | only through the executor and ports it receives | runs on the transaction its caller passes; never opens one | `recordCaseEvent({ db })` in `packages/api/src/abuse/case.ts` |
| **Orchestrator** | sequences operations, owns the transaction boundary, decides retries and the order of side effects | yes | opens them | tRPC procedures, server actions, route handlers, cron routes, workflow steps |
| **Adapter** | translates between a port and one provider | to its provider only | never | integration adapters; `TRPCServerManagement` in `packages/api/src/integrations` |

## Rules

**CMP-1 Decide in pure functions.**

- Branching that does not need I/O goes into a synchronous function that takes
  plain data and returns plain data.
- Test it without a database.

**CMP-2 Pass dependencies in.**

- An operation receives everything it touches as parameters:
  - the executor (`db: Executor` or `tx: Transaction` from `@virtbase/db/client`);
  - the ports it uses;
  - the current time, when its outcome depends on it (`now: Date`).
- An operation never imports `db`, never resolves a port from the registry, and
  never reads `process.env`.
- Orchestrators do those three things and pass the results down.

**CMP-3 One state change, one transaction. (defect)**

- Writes that must succeed or fail together run in one transaction, which the
  orchestrator opens.
- An operation that writes more than one row, or reads before it writes,
  requires a `Transaction` parameter. A single-statement helper accepts an
  `Executor`.
- Pass the options explicitly, as the codebase does: `{ isolationLevel: "read committed" }`,
  plus `accessMode: "read only"` for reads.

**CMP-4 No network inside a transaction. (defect)**

- Call a provider before the transaction opens or after it commits, never inside
  the callback.
- Record the provider's answer in a transaction of its own.
- The pool holds 10 connections per instance. A transaction waiting on a
  hypervisor holds one of them for the whole call.

**CMP-5 Side effects happen after commit. (defect)**

- Mail, notifications, provider calls and workflow starts run after
  `await db.transaction(...)` has returned, never inside its callback.
- From Phase 4 on they are `after` subscribers of an event emitted inside the
  transaction ([ADR 0006](../architecture/adr/0006-outbox-delivery.md)).
- Two things stay synchronous:
  - cache invalidation, which needs the request scope;
  - mail carrying a credential (OTP, reset link, magic link, deletion token, a
    generated root password).

**CMP-6 Make repeats harmless. (defect)**

Every unit that can run twice must produce the same result the second time. That
covers workflow steps, webhook handlers, crons, event subscribers, and anything
behind a retry. Do it with:

- a unique key that claims the work (`ON CONFLICT DO NOTHING`, as
  `subscription_renewals` does);
- a guarded transition (`transitionOrder`'s `guard` and `idempotent` options);
- provider idempotency keys derived from stable identifiers: the step ID, the
  event ID, `renewal:<id>:<attempt>`. Never derive them from the clock or from
  random values.

**CMP-7 Bound every loop that does I/O. (defect)**

- Batches have a size.
- Fan-out has a concurrency limit.
- A run has a time budget.
- One item's failure never aborts the others.

An unbounded `Promise.all` over rows read from the database is a defect. Use
`mapSettled(items, { concurrency }, fn)` from `@virtbase/utils`. It returns one
settled result per item. It does not exist yet: the first change that needs
bounded fan-out adds it, with tests.

**CMP-8 Settle every outcome. (defect)**

A reconciler handles every case explicitly. It does exactly one of three things:

- settles the row;
- leaves it unchanged for the next run;
- marks it failed once a named deadline has passed, as `BACKUP_STALE_AFTER_HOURS`
  does for backups.

No branch leaves a row in a state that nothing ever revisits.

**CMP-9 Throw inside, translate once at the boundary. (defect)**

- Inside a unit, throw `Error` subclasses that carry a `cause`.
- At a boundary, translate exactly once, into that boundary's language:
  `TRPCError`, an HTTP status, `FatalError` or `RetryableError`, `PortError`,
  `IntegrationError`.
- An error may only be swallowed through `reportSwallowedFailureStep` or a
  Sentry capture, with a comment saying why the caller must not fail. A
  `catch {}` that records nothing is a defect.

**CMP-10 Module scope is inert. (defect)**

- Importing a module performs no I/O, starts nothing, and reads no environment
  variable. The only exceptions are the bootstrap modules listed in
  [env-inventory.md](../architecture/env-inventory.md#bootstrap-allowlist).
- A singleton that must exist follows the `globalThis` pattern of
  `packages/db/src/client.ts`, and lives in a bootstrap module.

**CMP-11 Accept what you need, return what callers branch on.**

- Take the IDs and fields a unit needs, not whole rows.
- Return an expected outcome as a discriminated union, as `OffSessionResult` does
  in `packages/ports/src/payment-provider.ts`. Throw only for the unexpected.

**CMP-12 Compose instead of switching.**

- Write two functions composed by the caller, rather than one function with a
  boolean that changes what it does.
- An option that tunes a single behaviour is fine: `guard`, `idempotent`,
  `limit`.

**CMP-13 A list that must be complete gets a test.**

When you add a list that must name every member of something, add the test that
fails when a member is missing. That covers privacy registries, route maps, the
event catalogue, ID prefixes and translation keys. The model is
`packages/api/src/privacy/__tests__/subject-data.test.ts`.

**CMP-14 Split before review.**

Split a function before review, or give it an options object, if:

- it is longer than 60 lines;
- it nests more than three levels deep;
- it takes more than three positional parameters.

An exception is allowed when the PR description names the function and gives
the reason.

### The shape, in code

```ts
// Decision: pure, synchronous, no I/O.
export const nextOrderStatus = (current: OrderStatus, event: PaymentEventType): OrderStatus | null =>
  ORDER_TRANSITIONS[current][event] ?? null;

// Operation: one state change on the transaction it is given; ports are parameters.
export const recordPayment = async (
  tx: Transaction,
  input: { orderId: string; event: PaymentEvent },
): Promise<RecordPaymentResult> => {
  // reads and writes through tx only; emits its event through tx (Phase 4+)
};

// Orchestrator: owns the transaction, resolves dependencies, orders side effects.
export const settlePayment = async (event: PaymentEvent) => {
  const result = await db.transaction(
    (tx) => recordPayment(tx, { orderId: event.payment.orderId, event }),
    { isolationLevel: "read committed" },
  );
  if (result.status === "paid") await fulfilOrder(result.orderId); // after commit
  return result;
};
```

## Repairing defective code next to a change

The programme touches a codebase that has known defects
([risks.md](../architecture/risks.md#pre-existing-defects)). New code never
builds on top of them.

**Surrounding code.** The surrounding code of a change is:

1. every function in a file the change modifies;
2. every function the changed code calls, and every function that calls it,
   within the same package. That is one hop, found with the LSP's references
   and call hierarchy.

**Defect.** Code in that set is defective if it:

- appears in `risks.md`;
- breaks a rule marked **(defect)** in any guide;
- carries a comment that [comments.md](comments.md) forbids.

**CMP-15 Repair the surrounding code. (defect)**

- Repair every defect in the surrounding code in the same PR.
- Recode the defective unit into the shape this guide describes: split decision
  from operation from orchestrator, inject the executor and ports, use one
  transaction, make retries harmless.
- Patching around a defect, or wrapping it, is not a repair.

**CMP-16 Pin the defect first.**

- Write a test that fails because of the defect, then recode until it passes.
- A defect that cannot be pinned by a test is described in the PR, with the
  reason.

**CMP-17 Keep every caller working.**

- When a repair changes a signature, update every caller in the same PR.
- If that touches more than ten files or a second domain, ship the repair first,
  as its own draft PR, and stack the change on top of it.

**CMP-18 Record the repair.**

- List every repair in the PR description, under "Repaired along the way", with
  its risk ID (`C14`, `S2`) or rule ID.
- Mark the row in `risks.md` as fixed, with the PR number.

**CMP-19 Ask before changing what people see.**

When a repair would change behaviour a customer or an operator can observe
beyond the accepted behaviour changes
([decision D9](../architecture/decisions.md#d9-behaviour-changes-the-design-introduces)):

- stop, describe the change, and wait for an answer;
- or ship the repair behind the existing behaviour, and leave the change of
  behaviour for a separate PR.

**CMP-20 Never copy a defective pattern.**

- New code follows the guides, even when the code around it is consistently
  written another way.
- Defective code that is not surrounding code is added to `risks.md` with a
  proposed phase, and is not repaired in passing.

### Example: `applyPaymentEvent` (risk C21)

Today, four writes run without a transaction
(`packages/api/src/orders/apply-payment-event.ts`):

1. the claim in `payment_events`;
2. the payment upsert;
3. the order transition, which opens its own transaction;
4. the caller's fulfilment.

Recoded, they become:

- three operations on one `tx`:
  - `claimPaymentEvent(tx, …)`, which returns `{ status: "duplicate" }` on a
    conflict;
  - `upsertPayment(tx, …)`;
  - `transitionOrder(tx, …)`, now taking `tx` instead of opening its own
    transaction;
- an orchestrator, `settlePayment()`, that opens the transaction once and starts
  fulfilment after commit.

The pinning test fails the transition and asserts that no claim row remains.

### Example: starting a backup inside a transaction (risk C24)

`vzdump.$post` runs inside the transaction that writes `server_backups`
(`packages/api/src/router/servers/backups/index.ts`). Recoded:

1. Insert the backup row as `starting`, in its own transaction.
2. Start the task.
3. Record the task ID in a second transaction.

`reconcileServerBackup()` gains one branch: a row still `starting` after its
deadline is looked up by its own ID on the node, then settled or marked failed
(CMP-8). That makes the crash between steps 1 and 3 safe.
