# @virtbase/integration-abuseipdb

Sweeps Virtbase's own address ranges at AbuseIPDB for reports filed against
them, and looks up the reputation of a single address. It provides the `abuse`
and `ipReputation` ports.

The documentation is in [`docs/`](docs/README.md):

- [configuration](docs/configuration.md): the settings, the secret and their defaults;
- [architecture](docs/architecture.md): how the sweep picks, plans and checks its ranges, and its errors;
- [operations](docs/operations.md): failures and what to do about them;
- [security](docs/security.md), [data model](docs/data-model.md), [events](docs/events.md), [pages](docs/pages.md), [testing](docs/testing.md).
