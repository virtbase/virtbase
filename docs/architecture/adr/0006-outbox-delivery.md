# ADR 0006: Outbox delivery is a drain function, run after commit and by a cron

- Status: Accepted (2026-10-11)
- Date: 2026-10-11
- Requirements: R2, R7, R10

## Context

`after` hooks must be durable:

- An event must never be lost because the process died between commit and
  dispatch.
- An event must never be delivered for a transaction that rolled back.
- Delivery is at least once, and every subscriber gets an idempotency key.

Constraints:

- **Workflow DevKit 5.2's `start()` is not part of our transaction.** It
  records the run and enqueues it in parallel, and it throws when enqueuing
  fails (`workflow/docs/changelog/resilient-start.mdx`). All nine `start()`
  sites in the code commit first and then enqueue, with no dedupe key and no
  stored run id. Anything started after commit needs a sweeper behind it
  anyway.
- **The Vercel world bills per run, step and event,** and caps the events and
  steps of one run.
- **Functions have no `maxDuration`.** `vercel.json` has no `functions` block,
  so the platform default applies. Cron schedules have a granularity of one
  minute.
- **The repository already runs this pattern** for notifications and renewals.
  `notification_deliveries` with a 10-minute retry sweep, and the claim-by-insert
  renewals, are table-driven delivery with backoff.
- **`after()` gives us a request-scoped way** to run work once the response has
  been sent.

## Options

1. **One workflow per event.** After commit, `start(deliver, [eventId])` runs
   one step per subscriber, with Workflow DevKit retries and `sleep` for
   backoff.
2. **A drain cron only.** Every minute it claims due deliveries and runs them.
3. **A drain function with two triggers.** It runs right after commit through
   `after()`, or `waitUntil` inside a workflow step, for the events that
   request just wrote. A cron runs the same function every minute for
   everything due. Long-running subscriber work starts its own workflow.

## Decision

Option 3.

### Tables

`domain_events` is the outbox. It is written by `events.emit(tx, …)` in the
same transaction as the state change.

| Column | Notes |
| --- | --- |
| `id` | `evt_` ULID |
| `seq` | `bigint generated always as identity`; gives an order |
| `type`, `version` | catalogue name and payload version |
| `occurred_at` | |
| `user_id` | nullable; set null on user deletion |
| `subject_type`, `subject_id` | the aggregate, e.g. `server` / `kvm_…` |
| `source` | `core` or an integration id |
| `installation_id` | when an integration emitted it |
| `payload` | jsonb, validated against the catalogue on write |
| `pii` | classification at emit time |
| `dedupe_key` | unique, nullable |
| `correlation_id`, `causation_id` | the request or workflow run; the event that caused it |
| `fanned_out_at` | when deliveries were created |
| `created_at` | |

`event_deliveries` holds one row per event and subscriber:

| Column | Notes |
| --- | --- |
| `id` | `edl_` ULID |
| `event_id` | foreign key, `on delete cascade` |
| `subscriber` | `core:notifications`, `int:<installationId>:<hook>`, … |
| `status` | `pending`, `running`, `succeeded`, `failed`, `dead` or `skipped` |
| `attempts`, `next_attempt_at`, `locked_until` | |
| `last_error` | already redacted |
| `duration_ms`, timestamps | |

A unique index on `(event_id, subscriber)` makes fan-out idempotent.

### The drain

1. **Fan out.** Claim events with `fanned_out_at IS NULL`
   (`FOR UPDATE SKIP LOCKED`). Work out the subscribers from the effective-state
   snapshot: integration `after` hooks whose glob matches, plus the core
   subscribers. Insert their delivery rows with `ON CONFLICT DO NOTHING`, then
   set `fanned_out_at`. A subscriber enabled later does not receive events from
   before it was enabled.
2. **Deliver.** Claim due deliveries with `SKIP LOCKED`, set a lease
   (`locked_until`), and commit. Run each handler outside any transaction with
   its timeout and bounded concurrency, then record the outcome.
   - A failure sets `next_attempt_at` with exponential backoff and full jitter.
     The base is 30 s, doubling up to a 6-hour cap, for 10 attempts (about 24
     hours).
   - The last failure marks the delivery `dead` and reports to Sentry.
   - A crashed worker's lease expires and the delivery is claimed again.
3. **Budget.** The drain stops when its time budget is spent: about 5 s after a
   request, 45 s in the cron. Whatever is left waits for the next minute.

### Idempotency

- Each handler receives `idempotencyKey = "<eventId>:<subscriber>"`. It is
  stable across retries and replays, and it is what a subscriber passes to a
  provider (Stripe's `Idempotency-Key`, a Discord nonce) or stores in its own
  dedupe table.
- An event emitted from a workflow step carries
  `dedupe_key = "wf:<runId>:<stepId>:<type>"`, from `getWorkflowMetadata()`
  and `getStepMetadata()`. A retried step therefore inserts nothing new.
- **The event id stays a ULID.** Deriving the id itself from the run and the
  step, as the brief suggests, would give it a format that matches neither
  the `evt_` validators nor the time order IDs carry everywhere else. The
  unique dedupe key gives the same guarantee: one row per step, however often
  it is retried.

### Ordering

- `seq` gives a total order.
- The drain fans out in `seq` order. A subscriber normally receives events in
  that order, but one failing event never blocks the ones after it.
- Customer webhooks carry `seq`, and the documentation tells receivers to
  compare it rather than assume order.

### Long-running work

A subscriber that has to provision something on another system starts its own
workflow from the handler. It uses a hook token derived from the idempotency key
(`getHookByToken` / `createHook`), so a redelivery finds the run already there.
Handlers never wait on remote work for longer than their timeout.

### What does not move into the outbox

These stay synchronous at the write site:

- cache invalidation (`revalidateTag`, `revalidatePath`, `revalidateCheckout`),
  which needs a request scope;
- mail that carries a secret: OTP, password reset, magic link, account-deletion
  token. Such a secret must never be stored in an event payload.

### Retention and privacy

- Delivered events are purged after 30 days, and dead deliveries after 90.
- `offboard-user` replaces the payloads of the user's events with `{}`, sets
  `user_id` to null, and is registered in `SUBJECT_DATA`/`ERASURE_PLAN`, as
  `privacy/__tests__/subject-data.test.ts` requires for any table with a
  `user_id`.

## Why not the others

- **Option 1 (a workflow per event).** We would still need a sweeper, because
  `start()` can fail after commit. We would also pay per run, step and event
  for every power action and notification, and local tests would need a
  workflow world. The workflow log would also duplicate `event_deliveries`.
  Durable sleeps, the one thing a workflow adds here, are not needed when a
  `next_attempt_at` column and a one-minute clock do the same job.
- **Option 2 (cron only)** adds up to a minute of latency to every
  notification and webhook.
- **Option 3 delivers within the request's own invocation when it can,** and
  within a minute when it cannot. Its unit of work is one bounded handler, so
  it never approaches a function's maximum duration. It is a table, a function
  and a cron, which is what the brief asks an event bus to be.

## Consequences

- **A new cron, `/api/cron/dispatch-events`, runs every minute.** It sets
  `maxDuration` explicitly, and `vercel.json` gains the matching `functions`
  entry.
- **The admin event log reads these two tables** (see
  [integration-first.md §6](../integration-first.md#6-events-and-hooks)).
  - Replaying a delivery resets its row to `pending` and keeps the same
    idempotency key.
  - Replaying in bulk requires step-up.
- **`notification_deliveries` remains the notification subscriber's own
  per-channel log.** The outbox decides that a notification is owed; the
  notification log records each channel's attempt.
- **The retry-notifications sweep keeps its job.** Its stuck-`pending` gap is
  fixed in the same PR.
