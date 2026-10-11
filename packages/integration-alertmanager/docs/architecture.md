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
3. It answers at once with the number accepted, and submits the signals to the
   `signals` port through `ctx.waitUntil`, because Alertmanager's timeout is
   short and it retries anything but a 2xx. A retry is harmless: ingest is an
   upsert keyed on the alert's fingerprint.
