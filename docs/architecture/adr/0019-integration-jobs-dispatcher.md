# ADR 0019: Integration jobs run from one dispatcher cron

- Status: Accepted (2026-10-11)
- Date: 2026-10-11
- Requirement: R6

## Context

`apps/web/vercel.json` schedules 21 crons. Every one is a GET route behind
`withCronSecret`, with no `maxDuration`. Two of them exist only for an
integration:

- `sync-linked-account-metadata` (Discord, daily);
- `poll-abuse-sources` (AbuseIPDB, hourly).

None of the crons checks whether its feature is on.

If each integration added its own Vercel cron, every new integration would
mean editing `vercel.json`, and its cron would run whether or not the
integration was enabled. A cron cannot be scheduled per installation at all.

The repository already has a claim-by-insert pattern for exactly-once scheduled
work: subscription renewals.

## Decision

### Integrations declare jobs

```ts
jobs: [
  {
    id: "sync-role-connections",
    schedule: "0 3 * * *",  // UTC cron expression, parsed by a maintained library
    timeoutMs: 120_000,
    feature: "auth.discord-linked-roles",
    handler,
  },
],
```

The schedule is part of the `manifest` entry; the handler is part of the runtime
definition.

### One cron runs them

`/api/cron/integration-jobs` runs every minute. On each tick it:

1. **Works out what is due** for each `active` installation from the
   effective-state snapshot. A job whose feature is off is skipped.
2. **Claims each due run by inserting a row** into `integration_job_runs`:

   | Column | Notes |
   | --- | --- |
   | `id` | `ijob_` |
   | `installation_id`, `job_id`, `scheduled_for` | unique together |
   | `status` | |
   | `started_at`, `finished_at` | |
   | `error` | redacted |

   The unique index makes a run exactly-once, as `subscription_renewals` does
   for renewals.
3. **Runs the claimed handlers** with their timeouts and bounded concurrency,
   inside the tick's time budget. Anything left over is picked up on the next
   tick: a missed slot runs late, never twice.

### Long work and recording

- A job longer than a few minutes starts a workflow from its handler, as `after`
  subscribers do ([ADR 0006](0006-outbox-delivery.md)).
- Runs are kept for 30 days and shown on the integration's admin page with
  their last outcome.

### Core crons stay where they are

Core crons stay in `vercel.json`. Two kinds of route move behind the dispatcher:

- integration-specific routes;
- core crons whose work is per integration, such as `check-integration-health`.

Every remaining cron route gains `withFeature()`
([ADR 0007](0007-features-and-effective-state.md)) and an explicit
`maxDuration`.

## Consequences

- **Adding an integration never touches `vercel.json`.**
- **Each installation's schedule is honoured on its own.**
- **The dispatcher's own route is a single point of failure for integration
  jobs.** Its health becomes part of the platform's health: each tick records a
  heartbeat, and an alert fires when the heartbeat is older than five minutes.
- **One small dependency is added** for parsing cron expressions. Hand-rolling
  cron parsing is exactly the machinery the repository rules warn against.
