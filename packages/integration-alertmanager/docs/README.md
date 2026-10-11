# Alertmanager

Receives alerts from Prometheus Alertmanager, or from Grafana, and hands them to
Virtbase's abuse desk as signals. Abuse rules decide what becomes a case; an
alert never enforces anything unless a rule opts its source in.

It provides no port. It owns one webhook,
`POST /api/integrations/alertmanager/alerts`, and consumes the `signals` port
core provides.

## Quick start

1. Generate an ingest token: `openssl rand -hex 32`.
2. In Integrations → Alertmanager, choose the payload format, enter the token
   and enable the integration.
3. Add a receiver to Alertmanager (see `configuration.md`).
