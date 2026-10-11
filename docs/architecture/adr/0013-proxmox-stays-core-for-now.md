# ADR 0013: Proxmox becomes a core provider behind the provisioning port; extracting it is a later decision

- Status: Accepted (2026-10-11, decision D3)
- Date: 2026-10-11
- Requirement: R8

## Context

The brief offers two options:

- **(a)** wrap the Proxmox code behind the `provisioning` port as a core
  provider now, and move it into `integration-proxmox` later;
- **(b)** move it now.

The facts:

- **Size.** Proxmox code is about 80 files and 9,500–10,000 lines, plus about
  2,100 lines of tests:
  - `proxmox/` (19 files; `getProxmoxInstance` is referenced from 42);
  - `guest-os/`, `guest-firewall/`, `backups/`, `cloud-init/`,
    `template-images/`, `firewall-ai/` and `abuse/lock.ts`;
  - about 39 workflow files;
  - the server and ISO routers, 4,471 lines.
- **It is woven into the tRPC context.** `serverMiddleware` loads the node's
  API token and attaches a client as `ctx.instance`. That serves 36
  `serverProcedure`s in 17 files and 35 public REST paths under `/servers/*`.
- **Moving it would touch about 40 files that stay behind:** 15 routers,
  `trpc.ts`, `enforce.ts`, `fulfill-order.ts`, 11 files in `apps/web` and 10
  scripts.
- **An integration may not read core tables,** so a moved Proxmox would need
  ports for about 20 of them: nodes with credentials, node groups, datacenters,
  templates and template images, snippets, ISO downloads, backups, servers,
  subnets and allocations, pointer records, plans and prices, subscriptions and
  renewals, users, SSH keys and abuse case servers. It would also need a Redis
  port.
- **Moving workflow files renames their steps.** Workflow DevKit step IDs embed
  the module path, so runs in flight at deploy time could not resume.
- **The repository's own layer plan puts `proxmox` in Layer 3 (Domain), not
  Layer 4.** That is the header of `.dependency-cruiser.jsonc`, and
  `integration-no-domain` already names `packages/proxmox`. The abuse README
  keeps the abuse domain in `packages/api` *because* Proxmox is there. An
  `integration-proxmox` contradicts that plan.
- **The pattern already exists.** `ServerManagementPort` is a core-provided
  facade over the server routers, and Discord consumes it today.

## Decision

Option (a), with one correction to where Proxmox goes later.

### Now (Phase 6)

- **Register a core provider of `provisioning` for kind `server`.** It is
  provided by the internal `core` integration, the same way `serverManagement`
  is.
- **It delegates to the code that exists:**

  | Port method | Delegates to |
  | --- | --- |
  | `validateOrder` | the checks in `router/checkout.ts`, plus the template validation that today runs only after payment |
  | `provision` | starts the existing `provisionServer` workflow as a child run with a deterministic hook token, and returns `pending` |
  | `status` | reads the child run and the `servers` row |
  | `suspend` | the per-server body of the suspension cron (billing), and `abuse/lock.ts` (abuse) |
  | `unsuspend`, `renew` | `extendServerWorkflow`, which extends the term and powers a suspended guest back on. It must leave an abuse lock alone, which it does not today (C13) |
  | `terminate` | `deleteServerWorkflow` |
  | `changePlan` | `upgradeServerWorkflow` |
  | `actions` | what `server-state.ts` and `forbiddenStates` already encode |

- **No Proxmox file moves, and no workflow is renamed.** The routers, crons and
  `ServerManagementPort` keep working as they are.
- **From the order flow, Proxmox looks like any other provider.** Checkout, the
  generic workflows and the service list never import Proxmox code.

### Later (after Phase 7, its own decision)

Extract `packages/proxmox` as the **Layer 3 domain package** the layer plan
already names, not as an integration. Proxmox is the platform's own
infrastructure, with its own tables, IPAM and abuse enforcement. It is not a
plug-in an operator installs.

Revisit `integration-proxmox` only if a second hypervisor provider appears. By
then the port boundary will have been exercised by Pelican, and the extraction
will have shown which of the 20 tables are really Proxmox's own.

### Fixes that land regardless

These were found while mapping, and are scheduled in
[risks.md](../risks.md#pre-existing-defects):

- **Encrypt Proxmox node tokens.** `proxmox_nodes.token_secret` is plaintext.
  The fix is envelope encryption, as `NotificationTargetStore` already does per
  row.
- **Keep credentials out of workflow inputs.** Tokens and root passwords pass
  through workflow inputs today, so they are stored in the workflow event log.
  Steps load them by reference instead.
- **Give the node hookscript its own secret.** It authenticates with
  `CRON_SECRET`, the secret that authorizes every cron route.
- **Add a port to node addresses.** `ProxmoxEngine` is built without one, so
  Proxbase nodes on `127.0.0.1:18001` cannot be reached
  ([ADR 0017](0017-proxmox-e2e-on-proxbase.md)).
- **Bound the Proxmox client.** It retries a timed-out POST once, whatever the
  method, and polls tasks for about five minutes. Both get explicit limits.

## Consequences

- **The port is designed against three providers at once:** Proxmox through the
  facade, Pelican as the skeleton, and AutoDNS at contract level. That gives it
  a better chance of being right than a port designed for Proxmox alone.
- **Phase 6 stays a reviewable size.** It adds a facade and the generic
  workflows, not a 10,000-line move.
- **The abuse desk keeps reading `servers` and IPAM directly,** which matches
  its README.
- **Option (b)** would turn Phase 6 into the largest refactor in the programme.
  It would add about 20 ports whose only consumer is Proxmox, and risk in-flight
  workflow runs, for no change a customer could see.
