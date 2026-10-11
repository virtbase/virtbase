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
3. The dispatcher records the delivery. A failed delivery is retried by
   `/api/cron/retry-notifications`; `ctx.http` itself never retries a POST.

## The payload

`WebhookNotificationPayload` in `src/channel.ts` is a public API: `id`, `key`,
`severity`, `title`, `body`, `url`, `group_key`, `params`, `occurred_at`.

## Errors

- `webhook.no_endpoint`: the target has no URL.
- `webhook.endpoint_rejected`: the endpoint answered other than 2xx; retryable
  for 429 and 5xx. The endpoint's response body is not included.
- `ctx.http` adds `webhook.http_timeout` and `webhook.http_unreachable`.
