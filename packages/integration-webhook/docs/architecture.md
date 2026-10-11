# Architecture

| Entry | Holds |
| --- | --- |
| `@virtbase/integration-webhook/manifest` | identity and the `notifications` port it provides |
| `@virtbase/integration-webhook` | the runtime: the `notifications` factory and `localize()` |

## How a notification is delivered

1. Core's notification dispatcher (`packages/api/src/notifications`) matches the
   notification's key and severity against the operator targets, and calls
   `send()` once per matching webhook target, with the target's stored
   configuration as `notification.target`.
2. `WebhookNotificationChannel` builds the payload and POSTs it through
   `ctx.http`.
3. The dispatcher records the delivery in `notification_deliveries`. A failed
   delivery is sent again by `/api/cron/retry-notifications`, with the backoff
   in `BACKOFF_MINUTES`, until it has made `MAX_DELIVERY_ATTEMPTS` attempts
   (both in `packages/api/src/notifications/deliver.ts`). `ctx.http` itself
   never retries a POST.

## The payload

`WebhookNotificationPayload` in `src/channel.ts` is a public API: `id`, `key`,
`severity`, `title`, `body`, `url`, `group_key`, `params`, `occurred_at`.

## Errors

- `webhook.no_endpoint`: the target has no URL.
- `webhook.endpoint_rejected`: the endpoint answered other than 2xx. The
  endpoint's response body is not included.
- `ctx.http` adds `webhook.http_timeout` and `webhook.http_unreachable`.

The channel sets `retryable` on each error: true for 429, 5xx, a timeout and an
unreachable endpoint, false otherwise. The dispatcher does not read it:
`markFailed` in `deliver.ts` schedules every failed delivery for another
attempt, a 4xx included, until `MAX_DELIVERY_ATTEMPTS`.
