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
- The endpoint URL is treated as a secret too, because for some receivers (a
  Slack incoming webhook) the URL is the credential. `ctx.http` redacts both
  from its errors and breadcrumbs.
- The signature covers the timestamp, so a captured request cannot be replayed
  later against a receiver that checks the timestamp's age.
