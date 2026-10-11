# Security

## What it trusts

Nothing it receives: the endpoint's answer is used only for its status code,
and its body never reaches a log or an error.

## Who receives what

The channel delivers to operator audiences only. A customer-facing webhook is a
different feature with different authorisation; sharing a target would let an
operator's URL receive another person's notifications.

## Secrets

- The signing secret is stored encrypted and is used only to sign.
- The endpoint URL is a credential for some receivers (a Slack incoming
  webhook's path is its token), but it is not stored as a secret: it lives in
  plaintext in `notification_targets.config`, and the admin Notifications page
  receives it from `getNotificationSettings`. The channel passes it to
  `ctx.http` as a value to redact, so it is replaced with `[redacted]` in the
  errors and request breadcrumbs `ctx.http` produces. Risk S16 in
  `docs/architecture/risks.md` records the plaintext storage.
- The URL is not validated: neither `NotificationTargetInputSchema` in
  `@virtbase/validators` nor the channel requires HTTPS or refuses a private
  address.
- The signature covers the timestamp, so a captured request cannot be replayed
  later against a receiver that checks the timestamp's age.
