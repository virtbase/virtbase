# @virtbase/integration-alertmanager

Receives alerts from Prometheus Alertmanager or Grafana at
`POST /api/integrations/alertmanager/alerts` and submits them to the abuse desk
through the `signals` port.

The documentation is in [`docs/`](docs/README.md):

- [configuration](docs/configuration.md): the settings, the Alertmanager
  receiver, the label contract, an example rule and the generic format;
- [events](docs/events.md): what a signal becomes;
- [operations](docs/operations.md): the webhook's answers and common failures;
- [architecture](docs/architecture.md), [security](docs/security.md),
  [testing](docs/testing.md), [data model](docs/data-model.md) and
  [pages](docs/pages.md).
