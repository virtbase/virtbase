# A disposable Proxmox cluster

A three-node Proxmox VE 9 cluster with Ceph, in Docker, for local development and
for the opt-in Proxmox E2E suite. It exists so that provisioning, power actions,
firewalls and backups can be exercised without credentials to production.

```bash
bun setup:cluster     # everything: database, cluster, migrations, seed
```

or, if the rest of the environment is already up:

```bash
bun cluster:up        # build, start and bootstrap
bun script dev/cluster    # register the nodes with the dev database
```

`bun cluster:reset` tears it down completely; `bun cluster:down` just stops it.

The first run takes several minutes, most of it installing Ceph. Every run after
that is seconds: `bootstrap.sh` checks each stage and skips what is already done.

## Requirements

- A Linux host with `/dev/kvm` and nested virtualisation (`kvm_amd`/`kvm_intel`
  `nested=1`). WSL2 qualifies when nested virtualisation is enabled.
- ~10 GB RAM for the three nodes, and ~40 GB disk.
- **Privileged containers.** Proxmox manages cgroups, storage and networking
  directly. A privileged container with `/dev/kvm` is effectively root on the
  host - fine on a dev machine, not something to run anywhere shared.

## What you get

| | |
| --- | --- |
| Nodes | `pve1` `pve2` `pve3`, quorate, on `172.28.0.0/24` |
| Ceph | 3 mons, 3 mgrs, 3 OSDs, `vm-storage` (RBD) and `cephfs` |
| Web UI | <https://127.0.0.1:8006>, `root` / `virtbase` (`8007`/`8008` for the others) |
| Credentials | `cluster.json` - gitignored, holds a live API token |
| Patches | `scripts/patches` applied at image build (snippet upload, hookscript) |

`cephfs` is **shared** and carries iso/backup/snippets, so every node sees the same
ISO. That is the condition the `// TODO: Get correct storage node` in
`packages/api/src/router/iso/index.ts` is waiting for.

## Talking to it from the app

```bash
export NODE_EXTRA_CA_CERTS=$PWD/tooling/proxmox-cluster/pve-root-ca.pem
```

Proxmox serves its API with its own CA, and the client (`ProxmoxEngine`) uses bare
`fetch` with no way to skip verification. Trusting the one CA is the narrow fix;
`NODE_TLS_REJECT_UNAUTHORIZED=0` would disable verification for Stripe and
everything else too.

All three `proxmox_nodes` rows share `fqdn: 127.0.0.1` and differ by `hostname`.
`pveproxy` forwards `/nodes/<other>` to the right member, so one entry point
serves the whole cluster - which is the only shape that works here, because
`ProxmoxEngine` omits the port entirely when none is set and therefore always
talks to **443**.

## Known rough edge: restarting containers

A **cold start is reliable** - `reset.sh` then `bootstrap.sh` gives a healthy
cluster in about 100 seconds, and re-running `bootstrap.sh` against a healthy
cluster is a ~10 second no-op.

**Restarting the containers is not reliable.** Ceph OSDs frequently do not come
back, because loop devices, device-mapper nodes and LVM metadata all live in the
host kernel and are shared by all three containers - so after a restart a node
can find its block device unreadable, or worse, see another node's volume group.
`bootstrap.sh` tries to rebuild an OSD that does not return, but that path is not
dependable.

If the cluster comes back unhealthy, rebuild it:

```bash
./tooling/proxmox-cluster/reset.sh && ./tooling/proxmox-cluster/bootstrap.sh
```

It costs under two minutes and there is nothing in here worth preserving. Treat
the cluster as disposable, because it is.

## Resetting

```bash
docker compose -f tooling/proxmox-cluster/docker-compose.yml down -v
```

`-v` is the part that matters: cluster membership lives in the `pve*-cluster`
volumes (pmxcfs), not in the containers.

## Why the bootstrap looks the way it does

Proxmox does not expect to run in a container, and none of this is the documented
happy path. Each workaround in `bootstrap.sh` is load-bearing:

- `docker exec` only forwards stdin with `-i`. Both the SSH key distribution and
  `pveceph install` fail silently or hang without it.
- `/root/.ssh/authorized_keys` is a symlink into pmxcfs; replacing it breaks the
  cluster's own key management, so keys are appended through it.
- `pveceph osd create` refuses loop devices - PVE's disk enumeration filters them
  out. `ceph-volume` refuses them too, but accepts a logical volume, so the
  bootstrap builds the PV/VG/LV by hand first.
- `lvcreate` needs `udev_sync=0 udev_rules=0`, because udev never runs in a
  container and LVM otherwise waits forever for a device node.
- `ceph-volume` reads its bootstrap-osd keyring from
  `/etc/pve/priv/ceph.client.bootstrap-osd.keyring`, not its own default path.
- Pools are created with `pg_num 32`; the default 128 exceeds
  `mon_max_pg_per_osd` on a three-OSD cluster.
- Loop devices do not survive a container restart, so OSD units are started
  explicitly rather than trusted to come up on boot.


## The Proxmox patches

`scripts/patches` holds two patches to Proxmox's own Perl sources, and
provisioning does not work without them:

- **snippet upload** - stock Proxmox refuses `snippets` as an upload content
  type, so cloud-init snippets cannot be uploaded at all.
- **hookscript** - `hookscript` is not in `$generaloptions`, so the API rejects
  it on VM config updates.

They are applied in the `Dockerfile`, so every node has them from the first boot
and they survive container recreation. A patch that stops applying fails the
image build rather than showing up later as a confusing provisioning error.

```bash
docker exec virtbase-pve1 /opt/patches/patch.sh status
```

`e2e/proxmox/patches.e2e.ts` covers both against the running cluster.
