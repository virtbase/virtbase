# @virtbase/integration-prometheus

Provides the `metrics` port and serves a Prometheus scrape endpoint at
`GET /api/integrations/prometheus/metrics`.

## Configuration

Everything is configured in the admin console at
`/admin.virtbase.com/integrations/prometheus`. Nothing is read from the
environment.

| Field | Kind | Default |
| --- | --- | --- |
| Metric prefix | setting | `virtbase_` |
| Node.js runtime metrics | setting | on |
| Platform metrics | setting | on |
| Histogram buckets (ms) | setting | 5ms – 5min |
| Scrape token | secret | *required* |

The scrape token is required rather than optional. The endpoint is a public
route, and an unauthenticated one would publish the fleet's size, revenue shape
and node names to anyone who guessed the path. Generate one with
`openssl rand -hex 32`.

```yaml
scrape_configs:
  - job_name: virtbase
    scheme: https
    metrics_path: /api/integrations/prometheus/metrics
    static_configs:
      - targets: ["virtbase.com"]
    authorization:
      credentials: "<scrape token>"
    # Every scrape runs eleven aggregates against Postgres. Keep this well
    # above the default 15s.
    scrape_interval: 60s
```

A request with a missing or wrong token gets a 404, not a 401 — the same answer
the webhook dispatcher gives for an unknown or disabled integration, so the
endpoint cannot be used to confirm that this deployment runs Prometheus.

## What is exposed

**Platform metrics** are counted in Postgres at scrape time, so they are exact
regardless of how many instances are running or when they last restarted.

| Metric | Labels |
| --- | --- |
| `servers` | `state` = active \| installing \| suspended \| terminating |
| `servers_per_node` | `node`, `datacenter` |
| `server_backups` | `state` = running \| failed \| completed |
| `server_backup_bytes` | — |
| `server_backup_oldest_unsettled_seconds` | — |
| `orders` | `status` (the `order_statuses` enum) |
| `order_oldest_in_flight_seconds` | — |
| `payments` | `status` (the `payment_statuses` enum) |
| `payment_amount_minor_units` | `kind` = captured \| refunded, `currency` |
| `users` | — |
| `proxmox_nodes` | `datacenter` |
| `subnet_allocations` | `state` = allocated \| released |
| `platform_collector_up` | — |
| `platform_collector_duration_seconds` | — |

The two `*_oldest_*_seconds` gauges are the ones worth alerting on. An unsettled
backup row blocks every further backup of its server and can be neither deleted
nor restored, and an order that is neither fulfilled nor terminal is a customer
who has paid for nothing — both are conditions that a dashboard of totals hides.
They read `0` when there is nothing stuck.

Series are zero-filled from the enum they are labelled with, so a panel keeps
its shape and an alert on `== 0` can fire at all. `group by` alone would make
`state="failed"` vanish once the last failed row was deleted, which is not the
same thing as it reading zero.

**Runtime metrics** are prom-client's defaults — event loop lag, heap, GC, open
handles — for whichever instance answered the scrape.

## Recording your own measurements

```ts
const metrics = await integrations.resolve("metrics");
metrics?.increment({ name: "servers.provisioned", labels: { datacenter } });
metrics?.observe({ name: "provisioning.duration" }, elapsedMs);
```

Dotted names become prefixed snake_case (`virtbase_provisioning_duration`), and
`increment` adds the conventional `_total` suffix. `increment`, `gauge` and
`observe` map to a counter, a gauge and a histogram, so **one name may only be
used with one of the three** — the second type to claim a name is dropped with a
warning rather than throwing, because the port promises never to fail the work
being measured.

A metric's label set is fixed the first time it is recorded. A later sample
carrying an extra dimension loses that dimension; one missing a dimension
records it as the empty string. Never label with a user, server or IP.

## The caveat worth knowing

Counters, gauges and histograms recorded through the port live in the process
that recorded them. On a platform that runs several instances and restarts them
freely, a scrape reaches exactly one of those processes, so a counter answers
"how many did *this* instance see since *its* cold start" rather than "how many
were there". They are useful for rates and distributions across a fleet that
Prometheus aggregates itself; they are not a ledger.

The platform metrics above have no such problem — they are a `count(*)`, and any
instance returns the same answer. Anything that has to be exact belongs there.
