# Configuration

The integration has no settings and no secrets. Each target, on the admin
Notifications page, has:

| Field | Value |
| --- | --- |
| Endpoint URL | Receives a `POST` with the notification as JSON. |
| Signing secret | Optional. When set, every request carries `X-Virtbase-Signature: sha256=<hex>`, an HMAC-SHA-256 over `<timestamp>.<body>`, where the timestamp is the `X-Virtbase-Timestamp` header in Unix seconds. |

Every request also carries `X-Virtbase-Delivery`, the notification's id, which a
receiver can use to drop a repeated delivery.

## Verifying a request

Recompute the HMAC over `<timestamp>.<body>` with the signing secret, compare it
in constant time, and reject a timestamp older than a few minutes.
