# Operations

The integration has no health probe: it owns no standing connection, and each
target is a different endpoint. A target's deliveries show on the admin
Notifications page.

## Common failures

- **`webhook.endpoint_rejected` with 4xx.** The receiver refused the request:
  check its URL, its expected signature, and whether it accepts JSON. A 4xx is
  not retried.
- **`webhook.endpoint_rejected` with 5xx or 429, or `webhook.http_timeout`.**
  The receiver is down or slow; the retry cron sends it again.
- **`webhook.no_endpoint`.** The target was saved without a URL.
