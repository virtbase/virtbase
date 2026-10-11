# Configuration

Everything is configured on the integration's admin page. Nothing is read from
the environment.

| Key | Kind | Default | What it does |
| --- | --- | --- | --- |
| `prefix` | setting | `virtbase_` | Prepended to every metric name, the runtime metrics included. Must match `[a-zA-Z_:][a-zA-Z0-9_:]*`. |
| `collectDefaultMetrics` | setting | on | prom-client's runtime metrics (event loop lag, heap, GC, handles) for the instance that answers a scrape. |
| `collectPlatformMetrics` | setting | on | The platform gauges, read through `platformMetrics` at scrape time. |
| `durationBucketsMs` | setting | 5 ms to 5 min (`DEFAULT_DURATION_BUCKETS_MS`) | Histogram upper bounds, comma-separated. Non-positive and duplicate values are dropped and the rest sorted. |
| `scrapeToken` | secret | required | The bearer token a scrape must carry; at least 16 characters. |

Changing the prefix, the buckets or the runtime-metrics switch replaces the
process's registry, so counters restart from zero, which Prometheus treats as
a counter reset.

```yaml
scrape_configs:
  - job_name: virtbase
    scheme: https
    metrics_path: /api/integrations/prometheus/metrics
    static_configs:
      - targets: ["virtbase.com"]
    authorization:
      credentials: "<scrape token>"
    scrape_interval: 60s
```

Every scrape with platform metrics on runs every aggregate of
`readPlatformMetrics` in one database transaction and holds one pooled
connection while it runs. The example scrapes every 60 seconds so that each
Prometheus server costs one such transaction per minute.

## Platform metrics

| Metric | Labels |
| --- | --- |
| `servers` | `state` = active, installing, suspended, terminating |
| `servers_per_node` | `node`, `datacenter` |
| `server_backups` | `state` = running, failed, completed |
| `server_backup_bytes` | none |
| `server_backup_oldest_unsettled_seconds` | none |
| `orders` | `status`, every value of `order_statuses` |
| `order_oldest_in_flight_seconds` | none |
| `payments` | `status`, every value of `payment_statuses` |
| `payment_amount_minor_units` | `kind` = captured, refunded; `currency` |
| `users` | none |
| `proxmox_nodes` | `datacenter` |
| `subnet_allocations` | `state` = allocated, released |
| `platform_collector_up` | none |
| `platform_collector_duration_seconds` | none |

A server's state is the first that applies of suspended (`suspended_at` set),
terminating (`terminates_at` set, which provisioning sets to the end of every
prepaid term), installing (`installed_at` not set) and active. Counts by state
are zero-filled, so a series reads 0 instead of disappearing.

`server_backup_oldest_unsettled_seconds` reads 0 when no backup is unsettled,
and `order_oldest_in_flight_seconds` reads 0 when no order is in
`awaiting_payment`, `paid` or `fulfilling`; alert on a threshold. Abandoned
`awaiting_payment` orders are never cancelled (risk C17 in
`docs/architecture/risks.md`), so `order_oldest_in_flight_seconds` keeps rising
while one exists.
