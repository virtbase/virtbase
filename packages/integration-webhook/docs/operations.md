# Operations

The integration has no health probe: it owns no standing connection, and each
target is a different endpoint.

## Where a failure shows

No page in the admin console lists deliveries. A failed delivery leaves two
traces:

- its row in `notification_deliveries`: `status` is `failed`, `attempts`
  counts the attempts made, `next_attempt_at` is when the retry cron sends it
  again, and `error` holds the failure's message text. The error code is not
  stored.
- when Sentry is configured, an event for every failed attempt, tagged
  `notifications.channel: webhook` and `notifications.key`, with the same
  message.

`/api/cron/retry-notifications` sends every failed delivery again until it has
made `MAX_DELIVERY_ATTEMPTS` attempts (`packages/api/src/notifications/deliver.ts`),
including a failure that cannot succeed without a change at the receiver, such
as a 4xx. A `failed` row whose `next_attempt_at` is null has used up its
attempts.

## Common failures

Keyed on the message text in `error` and in the Sentry event. `[redacted]`
stands for the endpoint URL, which `ctx.http` redacts.

- **`The endpoint answered 4xx`**, for example `The endpoint answered 401`.
  The receiver refused the request: check its URL, its expected signature, and
  whether it accepts JSON.
- **`The endpoint answered 5xx` or `The endpoint answered 429`.** The receiver
  is down or throttling.
- **`[notifications] webhook timed out after 10000ms`** or
  **`POST [redacted] got no response within 10000 ms`.** The receiver did not
  answer in time. The first is the dispatcher's own timeout, `SEND_TIMEOUT_MS`
  in `deliver.ts`; the second is `ctx.http`'s, `HTTP_TIMEOUT_MS` in
  `packages/integration-sdk/src/http.ts`. Both are 10 000 ms. For a target with
  a signing secret the dispatcher's timer starts first, because the channel
  awaits the HMAC before `ctx.http` starts its own, so the first message is the
  one recorded; for a target without one, either can be.
- **`POST [redacted] failed: …`.** The endpoint could not be reached: DNS, TLS
  or a refused connection. The text after `failed:` is the runtime's reason,
  with the URL redacted.
- **`This webhook target has no endpoint URL configured. …`** The target was
  saved without a URL.
