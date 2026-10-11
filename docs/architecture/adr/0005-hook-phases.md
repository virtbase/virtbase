# ADR 0005: Four hook phases with explicit contracts

- Status: Accepted (2026-10-11)
- Date: 2026-10-11
- Requirements: R2, R7, R10

## Context

R2 asks for hooks before and after the database operation, and before and after
the action as a whole. Four facts constrain how that can work.

- **Core mutators do not take the caller's transaction.** There are 98
  transaction sites in `packages/api` and 50 in `apps/web`, all read committed.
  Mutators such as `transitionOrder()` each open their own transaction. Only an
  `Executor` type (`db | Transaction`, `packages/db/src/client.ts`) exists for
  helpers meant to join a caller's transaction, and `recordCaseEvent({ db })`
  is the one domain writer built that way.
- **The abuse domain writes without transactions,** apart from its two mailbox
  paths. Comments claiming otherwise (`abuse/enforce.ts`, `abuse/ordering.ts`)
  are wrong.
- **Some code holds a transaction across Proxmox HTTP calls.** The pool is
  capped at 10 connections per instance, and `vzdump` is started inside a
  transaction in `packages/api/src/router/servers/backups/index.ts`. A hook
  that adds network latency inside a transaction makes pool exhaustion worse
  for everyone.
- **better-auth owns the write that creates a user.** We cannot put our own
  statements into that transaction.

## Decision

### The contract for each phase

| | `before` | `beforePersist` | `afterPersist` | `after` |
| --- | --- | --- | --- | --- |
| Runs | before the action, outside any transaction | inside the transaction, before the core write | inside the transaction, after the core write | after commit, from the outbox ([ADR 0006](0006-outbox-delivery.md)) |
| Receives | `input` (catalogue `input` schema), actor | `ctx.tx`, `draft` | `ctx.tx`, the persisted record (the event payload) | the event envelope, `idempotencyKey` |
| May | veto with an `IntegrationError`; return a patch of `enrichable` input fields | patch `enrichable` draft fields; write its own tables | write its own tables, including rows referencing the new record | anything with side effects |
| Network | allowed, bounded by the timeout | **forbidden** | **forbidden** | allowed |
| Timeout | declared; default 1 s, at most 5 s | declared; default 250 ms, at most 2 s | same as `beforePersist` | declared; default 10 s, at most 60 s |
| On error or timeout | `failure: "closed"` fails the action, `"open"` logs and continues | `failure: "abort"` rolls the whole transaction back, `"skip"` rolls back to the hook's savepoint and continues | same as `beforePersist` | retried with backoff and jitter, then dead-lettered and reported |
| Repeats | none in a request; a retried workflow step runs it again | rolled back with a failed attempt, so never duplicated | same as `beforePersist` | at least once; the handler must be idempotent |

`failure`, `timeoutMs` and, for synchronous phases, `priority` are required
fields of a hook declaration. The SDK type has no defaults for them, so a policy
is never implicit.

### Ordering and enrichment

Synchronous hooks run in ascending `priority`, then by integration id, then by
installation slug. A patch is merged into the input or draft and validated
against the catalogue schema before the next hook runs. Each hook therefore sees
its predecessors' changes, and a patch that touches a field outside
`enrichable` fails the action. That failure is a bug in the hook, not a policy
decision.

### What runs at all

The hook index is built from the effective-state snapshot
([ADR 0007](0007-features-and-effective-state.md)). An integration that is
disabled, blocked by a missing dependency or misconfigured has no hooks in it.
With no hooks registered for an event, a call costs one map lookup and opens no
savepoint.

### Savepoints and timeouts inside a transaction

Each in-transaction hook runs in its own savepoint (a nested Drizzle
`tx.transaction()`), with `SET LOCAL statement_timeout` set to its budget. A
timer races the hook. JavaScript cannot cancel a promise, so when the timer
wins, the runner throws:

- `abort` rolls the whole transaction back;
- `skip` rolls back to the savepoint.

Either way, any statement the abandoned hook issues afterwards fails.

### No network inside a transaction

The hook runner marks its scope with `AsyncLocalStorage`.

- `ctx.http` refuses to send a request inside an in-transaction scope, in
  every environment.
- In development and tests, the runner also replaces `globalThis.fetch` for the
  scope so that it throws. That catches provider SDKs that bypass `ctx.http`.
- In production the same guard warns and reports to Sentry instead of
  throwing, so that an unforeseen path degrades rather than fails.
- The conformance suite runs every in-transaction hook with the throwing guard
  installed.

### Which events offer the synchronous phases

`after` is available for every event. A synchronous phase is available only
where core performs the write in one transaction that the hook runner can join.
The catalogue lists those phases in `sync`, and the conformance suite rejects a
hook on a phase the event does not offer.

| Events | Synchronous phases |
| --- | --- |
| order creation and transitions; subscription changes; service status changes ([ADR 0012](0012-products-and-services.md)); integration configuration changes | all three |
| abuse cases | all three, once Phase 4 wraps their writes in transactions |
| `user.registered` | `before` only (better-auth's `databaseHooks.user.create.before`) |

**How `user.registered` reaches the outbox.** Its `after` delivery cannot be
written in the same transaction as the user row. The drain sweeps for it
instead: users created in the last 24 hours with no `user.registered` row get
one, with the dedupe key `user.registered:<userId>`. This is the pattern for any
write a library owns.

### In workflows

A step that changes state opens its own transaction and runs the same phases.
If the step is retried:

- in-transaction hooks from the failed attempt were rolled back with it;
- `before` hooks run again, so they must be safe to repeat (the SDK
  documentation says so);
- the event is written once, because of its dedupe key
  ([ADR 0006](0006-outbox-delivery.md)).

### Observability

- **Spans.** Every hook run is a Sentry span with:
  - `op: "hook.<phase>"`;
  - the attributes `event.type`, `integration.id`, `installation.id`, `outcome`
    and `duration_ms`.
  `outcome` is one of `ok`, `vetoed`, `failed`, `timed_out` or `skipped`.
- **Recording.** Synchronous runs are recorded in `hook_runs`. The rows are
  written after the response with `after()`, never inside the transaction, so a
  rollback cannot erase the record of why it happened. They are kept for 30
  days.
- **Delivery records.** `after` deliveries are recorded in `event_deliveries`
  ([ADR 0006](0006-outbox-delivery.md)).

## Consequences

- **Every call site that offers synchronous phases changes shape:**

  ```ts
  const input = await hooks.before("order.created", raw, { actor });
  const order = await db.transaction(async (tx) => {
    const draft = await hooks.beforePersist(tx, "order.created", toDraft(input));
    const [row] = await tx.insert(orders).values(draft).returning();
    await hooks.afterPersist(tx, "order.created", row);
    await events.emit(tx, "order.created", toPayload(row));
    return row;
  });
  ```

  `events.emit` requires a `Transaction`, not an `Executor`. Writing an event
  outside the transaction that changes the state is therefore a type error.
- **Phase 4 must add transactions to the abuse writes** before abuse events can
  offer synchronous phases. Until then they are `after`-only.
- **The performance budget measures this code path:**
  - a call with no hooks;
  - a call with 1, 5 and 20 no-op hooks, in each phase.
  The test records a baseline file and fails at twice the baseline
  ([integration-first.md §13](../integration-first.md#13-quality-gates)).
- **A `before` hook adds its latency to a customer's request.** The SDK
  documentation recommends a budget under 500 ms and says what fail-open means
  for each kind of check.
