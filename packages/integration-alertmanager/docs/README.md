# Alertmanager

Receives alerts from Prometheus Alertmanager, or from Grafana, and hands them to
Virtbase's abuse desk as signals. An alert of an `abuse.` type that is
attributed to a customer opens a case, in `triage` unless an abuse rule with
`trusted_source` matches it; every other alert only notifies operators
(`events.md`). Only a `trusted_source` rule lets an alert enforce anything.

It provides no port. It owns one webhook,
`POST /api/integrations/alertmanager/alerts`, and consumes the `signals` port
core provides.

## Quick start

1. Generate an ingest token: `openssl rand -hex 32`.
2. In Integrations → Alertmanager, choose the payload format, enter the token
   and enable the integration.
3. Add a receiver to Alertmanager (see `configuration.md`).
