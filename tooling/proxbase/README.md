# A disposable Proxmox cluster

A three-node Proxmox VE 9 cluster with Ceph, built by
[proxbase](https://github.com/virtbase/proxbase) out of QEMU/KVM virtual
machines, for local development, for the opt-in Proxmox E2E suite and for
screenshots of real flows. It exists so that provisioning, power actions,
firewalls and backups can be exercised without credentials to production.

```bash
bun setup:cluster     # everything: database, cluster, migrations, seed
```

or, if the rest of the environment is already up:

```bash
bun cluster:up            # create or start the cluster, patch it, write cluster.json
bun script dev/cluster    # register the nodes with the dev database
```

`dev/cluster` is the cluster's stand-in for the admin "create node" action, so
it also uploads the guest hookscript to the snippet storage. Registering the
rows by hand is not enough: provisioning then reaches
`applyHardwareConfigStep` and fails with `script
'<storage>:snippets/hookscript.pl' does not exist`.

`bun cluster:down` shuts the nodes down, and `bun cluster:up` brings them back.
`bun cluster:reset` deletes the cluster.

## Requirements

- [proxbase](https://github.com/virtbase/proxbase/blob/main/docs/install.md)
  and `jq`. `proxbase doctor` checks the rest of the host.
- A Linux host with `/dev/kvm`. No root and no Docker: the nodes are ordinary
  QEMU processes owned by you.
- About 12 GB RAM for the three nodes, of which idle nodes hand about half
  back, and about 40 GB disk.

The first create on a host downloads the Proxmox ISO and builds a base image
with Ceph baked in, which takes 15-20 minutes. proxbase caches both in
`~/.cache/proxbase`, so every create after that takes a few minutes.

## What you get

|             |                                                                                      |
| ----------- | ------------------------------------------------------------------------------------ |
| Nodes       | `pve1` `pve2` `pve3`, quorate, on `10.10.10.0/24`                                    |
| Ceph        | 3 mons, 3 OSDs, `vm-storage` (RBD) and `cephfs`                                      |
| Web UI      | `proxbase status virtbase` lists each node's port on `127.0.0.1`                     |
| Shell       | `proxbase ssh virtbase pve2`, as root                                                |
| Credentials | `cluster.json` - gitignored, holds the live API token `proxbase@pve!api`             |
| Patches     | `tooling/pve-patches`, applied by `up.sh` (snippet upload, snippet mode, hookscript) |

The cluster is described by `cluster.yaml`. `cephfs` is **shared** and carries
iso/backup/snippets/import, so every node sees the same ISO.

## Talking to it from the app

```bash
export NODE_EXTRA_CA_CERTS=$PWD/tooling/proxbase/pve-root-ca.pem
```

Proxmox serves its API with its own CA, and the client (`ProxmoxEngine`) uses bare
`fetch` with no way to skip verification. Trusting the one CA is the narrow fix;
`NODE_TLS_REJECT_UNAUTHORIZED=0` would disable verification for Stripe and
everything else too. `bun setup:cluster` writes it to `.env`.

All three `proxmox_nodes` rows share the first node's forwarded port as their
`fqdn` (`127.0.0.1:19001`, say) and differ by `hostname`. `pveproxy` forwards
`/nodes/<other>` to the right member, so one entry point serves the whole
cluster. The port rides along in `fqdn` because `ProxmoxEngine` puts its host
into the URL unchanged.

Bun reads `NODE_EXTRA_CA_CERTS` only from the environment it starts in, not
from an `--env-file`. `bun dev` and `bun script` pass `.env` on to a child
process, which is why they get it from there; anything started as a single
`bun --env-file` process needs it exported.

### The console

`servers.console` hands the browser a noVNC URL pointing at `NOVNC_PROXY_URL`.
Locally that is the proxy from `apps/novnc-proxy`, without TLS:

```bash
# .env
NOVNC_PROXY_URL="ws://localhost:8443"
NOVNC_PROXY_SECRET="<openssl rand -hex 32>"

NODE_EXTRA_CA_CERTS=$PWD/tooling/proxbase/pve-root-ca.pem bun -F @virtbase/novnc-proxy start
```

A URL rather than a host makes the console connect without TLS on its port;
browsers allow plain `ws://` to localhost from an `https` page.

## Guest networking

Guests are bridged to `vmbr0`, the node's NAT uplink (QEMU user networking):
`10.0.2.0/24`, gateway `10.0.2.2`. The node itself is `.15` and the NAT hands
out DHCP leases from `.100`, so the seed allocates the static addresses `.20`
to `.44`. Every node has its own NAT, so a guest reaches the internet but not
the host or another node's guests, and nothing outside reaches a guest. The
console works regardless: it goes through the Proxmox API.

## Snapshots

A live snapshot holds every node's disks and memory, so restoring one resumes
the cluster in seconds - no boot, no waiting for Ceph. Useful before a run of
screenshots, or before anything destructive:

```bash
proxbase snapshot save virtbase clean --live
proxbase snapshot restore virtbase clean
```

The database is not part of it. Restore both together, or the app will list
servers that the cluster no longer has.

## The Proxmox patches

`tooling/pve-patches` holds three patches to Proxmox's own Perl sources, and
provisioning does not work without them:

- **snippet upload** - stock Proxmox refuses `snippets` as an upload content
  type, so cloud-init snippets cannot be uploaded at all.
- **snippet mode** - the upload API cannot express a file mode, and
  `check_hookscript` refuses a hookscript that is not executable. An uploaded
  snippet starting with a shebang is given mode `0755`.
- **hookscript** - `hookscript` is not in `$generaloptions`, so the API rejects
  it on VM config updates.

`up.sh` copies `patch.sh` and the patches to `/opt/virtbase-pve-patches` on
every node and applies them after each create or start. They are applied
rather than baked into the base image because installing Ceph upgrades
`libpve-storage-perl`, one of the packages they patch.

```bash
proxbase ssh virtbase pve1 -- /opt/virtbase-pve-patches/patch.sh status
```

`e2e/proxmox/patches.e2e.ts` covers all three against the running cluster.
