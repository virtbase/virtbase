# Architecture

| Entry | Holds |
| --- | --- |
| `@virtbase/integration-alertmanager/manifest` | identity, the settings and secrets schemas |
| `@virtbase/integration-alertmanager` | the runtime: the `alerts` webhook and `localize()` |

## How an alert flows

1. Alertmanager POSTs a batch to `/api/integrations/alertmanager/alerts`. The
   app's webhook route hands the untouched request to `handleAlertsRequest`.
2. The handler checks the bearer token in constant time, parses the body with
   the schema of the configured payload format (`src/parse.ts`), and turns every
   alert into an `InboundSignal`.
3. It resolves the `signals` port, answers with the number accepted, and
   submits the signals through `ctx.waitUntil`, after the response. The time
   Alertmanager waits for an answer therefore does not include the abuse
   pipeline, and an ingest failure after the 200 is only logged
   (`operations.md`).
4. A repeated alert is harmless: ingest upserts on `(source, externalId)`, and
   `externalId` is the alert's fingerprint.

Alertmanager's webhook notifier retries a 5xx answer and a network error. It
does not retry a 4xx: the notification fails, and the aggregation group sends
its alerts again only at its next `group_interval` flush.
