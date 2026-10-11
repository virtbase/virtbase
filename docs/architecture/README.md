# Architecture

Design documents for making Virtbase integration-first. Accepted on 2026-10-11:
every decision in [decisions.md](decisions.md) was taken as recommended.
Implementation follows the [style guides](../style/README.md).

| Document | What it is |
| --- | --- |
| [decisions.md](decisions.md) | the decisions taken before Phase 1, with their reasons |
| [integration-first.md](integration-first.md) | the target architecture for R1–R10, the quality gates and the phase plan |
| [adr/](adr/) | one record per significant decision: context, options, decision, consequences |
| [migration-plan.md](migration-plan.md) | how existing data, configuration and integrations move, release by release |
| [risks.md](risks.md) | the risk register, the defects found in today's code, and rollback per phase |
| [env-inventory.md](env-inventory.md) | every environment variable and configuration constant, classified |

## Architecture decision records

| ADR | Decision |
| --- | --- |
| [0001](adr/0001-event-names-use-dots.md) | Event names use dots |
| [0002](adr/0002-several-installations-per-integration.md) | An integration can have several installations |
| [0003](adr/0003-manifest-v2.md) | Manifest v2, split across four entry points, first-party only |
| [0004](adr/0004-event-catalogue-package.md) | `@virtbase/events` exposes a pure catalogue integrations may import |
| [0005](adr/0005-hook-phases.md) | Four hook phases with explicit contracts |
| [0006](adr/0006-outbox-delivery.md) | Outbox delivery is a drain function, run after commit and by a cron |
| [0007](adr/0007-features-and-effective-state.md) | One feature resolver over a cheap, explicit effective state |
| [0008](adr/0008-integration-pages-and-routes.md) | Integration pages mount through one catch-all per surface; the proxy decides the 404 |
| [0009](adr/0009-integration-procedures.md) | Integration procedures are declared as data and built into tRPC by the composition root |
| [0010](adr/0010-integration-data.md) | Owned tables join the one migration history; declared requirements live in a core table |
| [0011](adr/0011-global-settings.md) | Global settings extend `SettingsStore`, with secret settings, an audit log and a one-time import |
| [0012](adr/0012-products-and-services.md) | A generic product catalogue and service model, reached through a `provisioning` port |
| [0013](adr/0013-proxmox-stays-core-for-now.md) | Proxmox becomes a core provider behind the provisioning port; extracting it is a later decision |
| [0014](adr/0014-social-login-stays-in-env-for-now.md) | Social login stays in the environment until after Phase 5 |
| [0015](adr/0015-reference-provider-skeletons.md) | Reference skeletons: Pelican end to end, AutoDNS to contract level, Mailcow on paper |
| [0016](adr/0016-integration-docs-in-the-admin-console.md) | Integration docs are rendered in the admin console |
| [0017](adr/0017-proxmox-e2e-on-proxbase.md) | Proxmox E2E runs on Proxbase: one node per PR on request, three nodes with faults nightly |
| [0018](adr/0018-translation-standard.md) | One translation path for everything an integration shows to people |
| [0019](adr/0019-integration-jobs-dispatcher.md) | Integration jobs run from one dispatcher cron |
| [0020](adr/0020-coverage-gate.md) | Coverage thresholds are enforced per package from lcov, not by Bun alone |

A new ADR takes the next number, starts as `Proposed`, and is never edited after
it is accepted. A later ADR supersedes it instead.
