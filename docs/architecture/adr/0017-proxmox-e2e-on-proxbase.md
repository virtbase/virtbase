# ADR 0017: Proxmox E2E runs on Proxbase: one node per PR on request, three nodes with faults nightly

- Status: Accepted (2026-10-11, decision D7)
- Date: 2026-10-11
- Requirements: R10, testing strategy

## Context

### Today

- `tooling/proxmox-cluster` builds a three-node PVE 9 and Ceph cluster in
  privileged Docker containers. It uses an unpinned `dockurr/proxmox` image and
  applies `tooling/pve-patches` when the image is built.
- The Proxmox Playwright project skips itself unless `cluster.json` exists and
  the cluster answers.
- No CI job runs it.

### Proxbase

Proxbase is in the same organisation and installed locally as v0.2.0. It
creates real PVE nodes as nested KVM virtual machines. Measured on a standard
GitHub runner for one node:

- 4 minutes cold, or 1 minute with the cache warm;
- the whole job takes 3–6 minutes.

The runner needs `/dev/kvm` and QEMU 7.2 or newer, so it must be
`ubuntu-24.04`. `ubuntu-22.04` ships QEMU 6.2.

Proxbase's own nightly job has only covered one node with ZFS on GitHub's
runners. Not yet run there:

- several nodes;
- Ceph;
- fault injection;
- a guest booting inside a node, which would be a third level of
  virtualisation.

### Resources

- Three nodes need about 12 GiB of RAM on ZFS and 18 GiB on Ceph. The standard
  runner has 16 GB.
- ZFS `local` storage is not shared between nodes. The existing
  `cluster.e2e.ts` assumes shared storage.

### Fault injection

| Fault | What it does |
| --- | --- |
| `kill` | hard power-off |
| `freeze` / `thaw` | a hung node |
| `link` | a pulled cable |
| `partition` | splits the nodes into groups |
| `degrade` | adds latency and loss between nodes only |

Faults are applied through the CLI, one command at a time per cluster. Snapshots
need a stopped cluster; a full reset takes about 30 seconds per node.

### What blocks a drop-in swap

- **`getProxmoxInstance` builds `ProxmoxEngine` without a port,** so it always
  uses 443. Proxbase forwards node APIs to `127.0.0.1:18000+N`.
- **Proxbase has no per-node setup hook.** The patches have to be applied after
  creation, over SSH. They were tested against newer package versions than the
  ISO ships.
- **Guest IPs move to `10.0.2.0/24`.** Each node also needs a hosts entry so the
  hookscript webhook can reach the app.
- **Proxbase is two days old** (v0.1.0 and v0.2.0 both released 2026-10-09),
  and its file format is `v1alpha1`.

## Decision

### Every PR, opt-in

Triggered by the `e2e:proxmox` label, or by a path filter on `packages/api/src/proxmox/**`,
`packages/api/src/workflows/**` and `tooling/**`:

- one node on `ubuntu-24.04` with `--golden`;
- a warm cache, and pinned Proxbase, action SHA and `pve-version`;
- it runs the patch tests, a provisioning smoke test and the Proxmox Playwright
  project, skipping shared-storage specs.

Expected cost: 2–4 minutes on top of the E2E job. Without the label, the PR
description says the suite did not run.

### Nightly

- three nodes, with Ceph or with ZFS at 4 GB each;
- the full Proxmox project plus the fault suite;
- on a larger runner (32 GB or more) or a self-hosted KVM host;
- expected to take 30–60 minutes.

### Fault scenarios

Each one must end settled, by the reconciliation rules in `AGENTS.md`:

| Scenario | How |
| --- | --- |
| Power loss during `provision-server` | wait for the clone task's UPID, `fault kill`, then `start` |
| A partitioned node during a backup | `fault partition` while `vzdump` runs, reconcile, then `clear` |
| A hung node during lock reconciliation | `fault freeze`, run `/api/cron/reconcile-abuse-locks`, then `thaw`. The abuse code sets no request timeouts, so this shows whether one node can stall the cron. |
| Latency between the app and Proxmox | toxiproxy in place of the port forward, because Proxbase's `degrade` only acts between nodes |

The fault specs run serially, with one worker, because Proxbase holds a cluster
lock per command.

### Prerequisites, in Phase 7's first PR

- **Port support for nodes:** a nullable `port` column and the validators that
  go with it. This is a product improvement too.
- **An adapter that writes `cluster.json`** from `proxbase env --format json`,
  so Playwright and `bun script dev/cluster` stay unchanged.
- **Patches applied over `proxbase ssh`,** followed by a snapshot. The adapter
  runs `patch.sh dry-run-apply` first.
- **Network setup:** guest IP ranges, and the hosts entry for the hookscript.
- **Five checks before anything relies on Proxbase:**
  1. a guest boots inside a node on the runner;
  2. three nodes and the app fit in the memory of the chosen runner;
  3. the patches apply to the ISO's package versions;
  4. static `10.0.2.x` guest IPs work;
  5. Bun's `fetch` trusts the CA through the forward.

### Retiring the Docker cluster

`tooling/proxmox-cluster` stays until the nightly job has been green for two
weeks, and is then removed.

### The baseline job moves earlier

A one-node nightly job running the current Proxmox suite starts **before
Phase 6**, which refactors provisioning behind the port. It is the safety net
for that refactor. This is part of decision D8.

## Consequences

- **Proxmox coverage stops depending on a developer's machine.**
- **The one-node job cannot exercise failover or shared storage.** The PR
  description says so whenever the label was used instead of the nightly job.
- **Proxbase is pinned and tracked as a dependency.** Four upstream requests
  would remove workarounds: a per-node setup hook, faults on the API path, a
  `portBase` input on the Action, and the ISO version in the cache key.
