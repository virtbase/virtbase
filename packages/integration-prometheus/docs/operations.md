# Operations

The health probe makes no outbound request. With platform metrics on, it reads
one snapshot through `platformMetrics`; then it serialises the registry.

| Health | Meaning |
| --- | --- |
| ok | A scrape would succeed. |
| degraded | Core could not read the platform counts. Scrapes still answer, with `platform_collector_up 0` and the runtime metrics. |
| error | The registry failed to serialise, or the platform read took longer than the 5 s health budget (`HEALTH_BUDGET_MS` in `@virtbase/integration-sdk`); the message says why. |

## Common failures

- **Prometheus reports the target down with a 404.** The token is missing or
  wrong, or the integration is off. Both answer the same 404 by design.
- **`platform_collector_up` reads 0.** The snapshot read failed; the instance's
  log carries "Failed to collect platform metrics" with the error. Check the
  database. The platform gauges keep the values of the last successful read
  and are still served, so alert on `platform_collector_up`, not on them.
- **A counter series restarts from zero.** An instance restarted, or the
  prefix, buckets or runtime-metrics switch changed.
- **A metric recorded through the port is missing.** The log says why, once
  per name: a name with nothing valid left after sanitising, the name of a
  platform gauge or of a runtime metric, a non-finite value, or a name already
  used by another of `increment`, `gauge` and `observe`.

## Rotating the token

Save the new token, update the scrape job's credential, and check that the
target is up again. Between the two steps scrapes answer 404.
