# ADR 0015: Reference skeletons — Pelican end to end, AutoDNS to contract level, Mailcow on paper

- Status: Accepted (2026-10-11, decision D5)
- Date: 2026-10-11
- Requirement: R8

## Context

R8 asks for at least one non-server provider that:

- passes the port contract suite against a mocked API;
- shows the whole flow in E2E: order, payment, provisioning, events and the
  dashboard.

Pelican is preferred because it can run in CI. The three candidate providers
stress the `provisioning` port ([ADR 0012](0012-products-and-services.md)) in
different places:

| Provider | Stresses | Sandbox for CI |
| --- | --- | --- |
| Pelican | allocations and capacity, owned tables, panel accounts and sign-on, multi-installation | yes: the panel runs as a container. Wings, which runs game servers, needs Docker on the host. |
| AutoDNS (InterNetX) | per-TLD registry prices, periods in years, transfers that stay `pending` for days, TLD-specific contact rules, registry renewal | no public sandbox; a mock built from its published API description |
| Mailcow | a cross-integration dependency on DNS records | it can run, but it is a dozen containers and too heavy for every PR |

## Decision

### Pelican: full skeleton

`integration-pelican` is built to the R6 definition of done:

- manifest v2;
- `multiInstance`;
- product config (egg, location, limits);
- owned tables for panel users and allocations;
- the provisioning methods `provision`, `status`, `suspend`, `unsuspend`,
  `terminate` and `changePlan`;
- one customer action that returns a short-lived panel login link;
- a customer service page;
- an admin page listing nodes and free allocations;
- `docs/`.

**E2E runs against a real panel container** in the E2E job. The panel needs no
Wings node for these specs: a server it creates sits in "installing" until a
node reports, and the specs check both the panel's records and our own state.
The panel is seeded with a fake node and allocations. The full install path
needs Docker-in-Docker and runs in the nightly job.

**The contract suite runs against recorded fixtures** of the Pelican Application
API.

### AutoDNS: contract-level skeleton

`integration-autodns` implements `validateOrder` (availability), `quote`
(per-TLD prices plus markup), `provision` (registration, or a transfer that
returns `pending`), `status`, `renew` and `terminate`. It runs against a mock
server built from the published API description; the limitation is written down
in its `testing.md`. It has no pages and is not wired into checkout E2E.

Its job is to prove that the port, the `quote` path and dynamic checkout fields
are not shaped by servers alone.

### Mailcow: on paper only

The design in [integration-first.md](../integration-first.md#11-products-services-and-provisioning)
shows how Mailcow maps onto the port and onto `requires: { ports: ["dnsZones"] }`.
The `dnsZones` port and its contract suite are specified there. A fake DNS
provider in the conformance tests exercises the case where a dependency is
missing, or disabled later, without Mailcow existing.

## Consequences

- **Phase 6 builds two integrations,** one fully and one to contract level. The
  E2E job gains a Pelican container. It is a single service image, and the
  measured budget for it is set when the job lands.
- **Domain-specific UI is out of scope:** search, transfer forms, nameserver
  editing. The port and the data model support it, and AutoDNS's pages are left
  for the PR that makes it a product.
- **The `dnsZones` port is specified but has no real provider** until PowerDNS
  gains forward zones or a registrar implements it. Its contract suite runs
  against the fake.
