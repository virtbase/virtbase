# Prometheus

Prometheus serves Virtbase's metrics on an authenticated scrape endpoint,
`GET /api/integrations/prometheus/metrics`, for Prometheus and Grafana. It
provides the `metrics` port, which records counters, gauges and histograms
into this process's registry, and it consumes the core `platformMetrics` port
for the counts of servers, backups, orders, payments, users, nodes and IP
allocations.

## Quick start

1. Generate a scrape token: `openssl rand -hex 32`.
2. Open the Prometheus page in the admin console, paste the token, and enable
   it. The other settings have defaults.
3. Point a scrape job at the endpoint with the token as its bearer credential
   (see [configuration](configuration.md)).

See [operations](operations.md) for what each health state means.
