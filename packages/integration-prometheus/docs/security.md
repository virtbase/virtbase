# Security

## What it trusts

The scrape token is the only access control. Without it the endpoint would
publish the fleet's size, the revenue per currency and the node names, so the
token is required to enable the integration.

## Untrusted input

The `Authorization` header is the only input. It is compared to the token in
constant time (`safeSecretCompare`), and every failure, including a missing or
malformed header, answers the same 404 the dispatcher gives a disabled or
unknown integration, so the endpoint does not confirm that Prometheus is
installed.

As of 2026-10-11 nothing in `packages/` or `apps/` records through the
`metrics` port. A caller must pass names and label values that its own code
chooses, never text taken from a request, and labels must never carry a user,
a server or an address (`MetricLabels` in `@virtbase/ports`). Names are
sanitised to the Prometheus character set.

## Who sees what

Whoever holds the token sees aggregate counts and amounts, never a user, a
server or an address. The response is marked `no-store`.

## Secrets

The scrape token is the only secret, write-only in the admin console and
redacted by `ctx.logger`. An attacker with it could read the metrics, nothing
else.
