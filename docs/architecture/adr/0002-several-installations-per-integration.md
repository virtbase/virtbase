# ADR 0002: An integration can have several installations

- Status: Accepted (2026-10-11, decision D2)
- Date: 2026-10-11
- Requirements: R1, R4, R6, R7, R8

## Context

`integration_installations.integration_id` is unique
(`packages/db/src/schema/integrations.ts`), so each integration can be installed
once. Everything above the table assumes this:

- `IntegrationConfigStore` addresses rows by integration id, including its
  `onConflictDoUpdate` target (`packages/config/src/integration-store.ts`).
- The registry caches one context per integration and keys adapters as
  `<integrationId>:<port>` (`packages/integration-sdk/src/registry.ts`).
- Webhooks are mounted at `/api/integrations/<integrationId>/<path>`.

Secrets already hang off the installation row rather than the integration:
`integration_secrets.installation_id`, with a data key per installation. The
storage layer is one column away from supporting several installations.

The cases that need more than one installation are provisioning back ends and
reseller accounts:

- a Pelican panel per region or game-server location;
- a Mailcow server per mail cluster;
- two registrar reseller accounts with different TLD portfolios.

Two other cases are deliberately not part of this:

- **Proxmox clusters.** While Proxmox stays in core
  ([ADR 0013](0013-proxmox-stays-core-for-now.md)), clusters remain rows in
  `datacenters` and `proxmox_nodes`.
- **A Stripe test account next to a live one.** Test mode belongs to a preview
  deployment. A production instance that can take test-mode payments can fulfil
  orders nobody paid for.

What a second installation changes everywhere else:

- R8 services must know which panel they live on.
- R4 owned rows must know which account they belong to.
- R2 events must say which installation emitted them.

Adding that later means backfilling a provider reference on every service and
every owned row.

## Options

1. **Keep one installation per integration** and revisit later.
2. **Allow several installations for every integration.**
3. **Model several installations everywhere, but let each integration opt in**
   with `multiInstance: true` in its manifest. Everything new is addressed by
   installation.

## Decision

Option 3.

### Schema

- Add two columns to `integration_installations`:
  - `slug`: defaults to `default`, unique per integration;
  - `label`: shown in the admin console.
- Replace the unique index on `integration_id` with one on
  `(integration_id, slug)`.
- An integration without `multiInstance` always has exactly one row, with slug
  `default`. The config store enforces this against the manifest, because the
  database cannot see manifests.

### Registry

- Contexts and adapters are keyed by installation id.
- `ctx.installation` exposes `{ id, slug, label }`.
- `resolve(port, { installationId })` takes precedence over
  `resolve(port, { integrationId })`. The second form keeps working: it means
  the integration's only installation, and it throws when there is more than
  one.

### What is per installation and what is per integration

| Per installation | Per integration |
| --- | --- |
| settings and secrets | the manifest and its version |
| enabled flag and effective state ([ADR 0007](0007-features-and-effective-state.md)) | features declared |
| health | documentation |
| webhooks, jobs and hook deliveries | page declarations |
| owned rows: a non-null `installation_id` foreign key with `onDelete: "restrict"` | |
| the services and products it provides | |

A feature is on when at least one installation that provides it is effectively
enabled.

### Webhook addresses

- `/api/integrations/<integration-id>/<path>` keeps its meaning: the default
  installation. Every URL already configured at Stripe, Discord, Alertmanager
  and the others keeps working.
- `/api/integrations/<installation-id>/<path>` addresses any installation.
  Installation ids carry the `intg_` prefix, and integration ids may not, so
  the two forms cannot collide. The conformance suite checks the prefix rule.

### Admin URLs

- `/integrations/<id>` lists the installations.
- A multi-instance integration nests its pages under
  `/integrations/<id>/<slug>/...`.
- A single-instance integration keeps `/integrations/<id>/...`.

The manifest says which form applies, so a URL is never ambiguous.

## Consequences

- **The migration is expand/contract and backwards compatible.**
  1. Add the columns and backfill `slug = 'default'`.
  2. Create the composite unique index.
  3. In the following release, drop the old index.
  The old code keeps working against the expanded table, because it never
  writes a second row.
- **`IntegrationConfigStore`'s methods take an installation id.** Integration-id
  lookups remain as helpers for single-instance integrations.
- **The admin hub needs "Add installation"** for multi-instance integrations.
  Uninstalling the last installation is the same flow as uninstalling a
  single-instance integration ([ADR 0010](0010-integration-data.md)).
- **Key rotation already works per installation,** so it is unaffected. The
  rotation test gains a case with two installations of one integration.
- **Every existing integration stays single-instance.** The Pelican skeleton is
  the first integration that opts in.
