Proxmox VE patches used by Virtbase for snippet storage and VM hook scripts,
packaged as `virtbase-pve-patches` so they survive package upgrades.

## Why this is a package

The three patches edit files owned by two Debian packages:

| File | Owning package |
| --- | --- |
| `PVE/Storage.pm`, `PVE/API2/Storage/Status.pm` | `libpve-storage-perl` |
| `PVE/API2/Qemu.pm` | `qemu-server` |

Upgrading either one restores the stock file and silently reverts the patches,
after which snippet upload fails, the hookscript loses its executable bit and
`hookscript` is rejected on config update - that is, provisioning stops
working. `unattended-upgrades` does this without anyone watching.

The package carries a dpkg file trigger on `/usr/share/perl5/PVE`, so dpkg
reapplies the patches at the end of any transaction that writes there. A daily
systemd timer covers edits that do not go through dpkg.

Reapplying is the easy half. A patch that no longer *fits* its context - after
a Proxmox version bump - cannot be reapplied by anyone, and no amount of
retrying helps. That state is published to the node_exporter textfile collector
and to the systemd unit state your Alloy config already scrapes; see
[Monitoring](#monitoring).

Without the snippet-upload patch, custom cloud-init snippets cannot be uploaded for VMs.
Without the snippet-mode patch, an uploaded hookscript is not executable and Proxmox refuses to reference it.
Without the hookscript patch, the `hookscript` VM option is not accepted in general VM config updates.

Reference issue (snippet upload):
https://bugzilla.proxmox.com/show_bug.cgi?id=2208

Original snippet-upload patch:
https://bugzilla.proxmox.com/attachment.cgi?id=389

Tested with:
- `libpve-storage-perl` 9.1.8 (snippet upload, snippet mode)
- `qemu-server` 9.2.7 (hookscript)

Pin the *package* versions, not the `pve-manager` version. They move
independently - a node reporting `pve-manager/9.2.10` can be carrying
`libpve-storage-perl` 9.1.8, and it is the package that owns the patched file.

## Editing a patch desynchronises already-patched nodes

`patch.sh` decides that a patch is `applied` by reverse-applying it, so a patch
only recognises trees it produced itself. Change what a patch *writes* - even
the indentation of one line - and every node carrying the old output classifies
as `unknown`: the forward dry-run fails because the other hunks are already
there, and the reverse fails on the line that moved.

Nothing is broken, and the machinery is right to refuse: it cannot tell that
drift apart from a genuine version mismatch. But it does not self-heal, so
after editing a patch, restore the stock file on each node and let the trigger
reapply:

```bash
apt-get install --reinstall -y libpve-storage-perl   # or qemu-server
```

That wipes the old output, and the dpkg trigger reapplies every patch from the
current package in one step. Verify with `patch.sh status`.

## Patch files in this directory

All patches are unified diffs with `-U3` and share the same apply base (`/usr/share/perl5/PVE`, `-p1`).

| Patch | Target file(s) on Proxmox |
| --- | --- |
| `proxmox-snippet-upload.patch` | `API2/Storage/Status.pm`, `Storage.pm` |
| `proxmox-snippet-mode.patch` | `API2/Storage/Status.pm` |
| `proxmox-hookscript.patch` | `API2/Qemu.pm` |

They are independent: `proxmox-snippet-mode.patch` only touches stock context, so it applies with or without the upload patch and in either order. Nothing has to be unapplied to pick it up - `patch.sh apply` on an already-patched node classifies the other two as `applied` and adds this one.

### Snippet upload (`proxmox-snippet-upload.patch`)

Updates:

- `/usr/share/perl5/PVE/API2/Storage/Status.pm` — allow `snippets` content type on upload
- `/usr/share/perl5/PVE/Storage.pm` — add `get_snippet_dir`

Applying one patch for both files is expected and correct.

### Snippet mode (`proxmox-snippet-mode.patch`)

Updates `/usr/share/perl5/PVE/API2/Storage/Status.pm`:

- an uploaded snippet whose first line is a shebang is given mode `0755`
- the local copy uses `cp --preserve=mode`, so overwriting an existing snippet updates its mode too

`PVE::GuestHelpers::check_hookscript` refuses a hookscript that is missing **or** not executable, and the upload API has no parameter for a file mode. Without this patch every guest creation fails at the config update with `script '<storage>:snippets/hookscript.pl' is not executable`.

The shebang is what separates a hookscript from a cloud-init data snippet; snippets without one stay `0644`.

### Hookscript (`proxmox-hookscript.patch`)

Updates:

- `/usr/share/perl5/PVE/API2/Qemu.pm` — add `hookscript` to `$generaloptions`

## Install on a Proxmox node

```bash
./build.sh                     # builds dist/virtbase-pve-patches_<version>_all.deb
```

Copy the `.deb` to each node and:

```bash
apt install ./virtbase-pve-patches_1.0.0_all.deb
```

`apt` rather than `dpkg -i` so the `libpve-storage-perl` and `qemu-server`
dependencies are checked. Installing applies the patches immediately; from then
on the trigger keeps them applied.

To confirm the trigger is registered:

```bash
dpkg-trigger --check-supported && grep -r virtbase /var/lib/dpkg/triggers/
```

### What it installs

| Path | |
| --- | --- |
| `/usr/share/virtbase-pve-patches/` | the patches and `patch.sh` |
| `/usr/sbin/virtbase-pve-repatch` | reapply + publish metrics; the admin entry point |
| `/usr/lib/systemd/system/virtbase-pve-repatch.{service,timer}` | the daily safety net |
| `/etc/default/virtbase-pve-repatch` | optional overrides (not shipped; create if needed) |

### Removing

```bash
apt remove virtbase-pve-patches
```

`prerm` reverts the patches, so the node is left on stock Proxmox.

## Monitoring

Reapplying is the easy half. What cannot self-heal is a patch that no longer
*fits* its context after a Proxmox version bump: `patch.sh` correctly refuses
to force it, no amount of retrying helps, and guest provisioning on that node
is broken until someone rebases it. That state has to leave the node.

### The signal you already collect

`virtbase-pve-repatch` exits non-zero on `pending` or `unknown`, and
`virtbase-pve-repatch.service` sets no `Restart=`, so a drifted node leaves the
unit in `failed`. The fleet's Alloy config enables the `systemd` collector with
`unit_include = ".+"`, so that is already scraped - **no Ansible change is
needed for this**:

```promql
node_systemd_unit_state{name="virtbase-pve-repatch.service", state="failed"} == 1
```

The daily timer bounds how long a drift can hide; the postinst also pokes the
unit when the dpkg trigger hits a failure, so in practice it surfaces within
seconds of the upgrade that caused it rather than at the next timer run.

### Per-patch detail (optional, needs an Ansible change)

`virtbase-pve-repatch` also writes the state of each patch for the
node_exporter textfile collector:

```
virtbase_pve_patch_state{patch="proxmox-hookscript.patch"} 1
virtbase_pve_patch_last_run_timestamp_seconds 1788087683
```

`1` applied, `0` pending, `-1` unknown.

This is written but **not scraped** as things stand: `prometheus.exporter.unix`
in `roles/common_alloy/templates/config.alloy.j2` has no `textfile` block, and
the collector reads nothing without a directory. To pick it up, add:

```hcl
prometheus.exporter.unix "integrations_node_exporter" {
  // ... existing config ...

  textfile {
    directory = "/var/lib/prometheus/node-exporter"
  }
}
```

The file is skipped silently when that directory does not exist, so the
package is safe to install before the role is updated. Point `TEXTFILE_DIR` at
somewhere else if the role prefers a different path.

Alerting rules are not shipped here - they belong with the rest of the
Ansible-managed Prometheus config. The two worth writing:

| Expression | Meaning |
| --- | --- |
| `virtbase_pve_patch_state == -1` | drifted; needs a rebase (critical) |
| `virtbase_pve_patch_state == 0` for 30m | trigger is not firing (warning) |

### Why the postinst swallows the failure

**`virtbase-pve-repatch` exits non-zero, but the postinst calls it with
`|| true` on purpose.** A failed rebase must not leave dpkg half-configured on
a hypervisor mid-upgrade, because that blocks every later `apt` run - a worse
outage than the one it would be reporting. The failure travels through the
journal, the unit state and the metrics file instead.

Overrides go in `/etc/default/virtbase-pve-repatch`:

```sh
TEXTFILE_DIR=/var/lib/prometheus/node-exporter
SKIP_RESTART=1
```

## Driving the patches by hand

On a node with the package installed, `patch.sh` is at
`/usr/share/virtbase-pve-patches/patch.sh`. From a checkout it runs in place:

```bash
./patch.sh status          # show which patches are already applied
./patch.sh status --json   # the same, for virtbase-pve-repatch
./patch.sh dry-run-apply   # verify every patch would apply cleanly
./patch.sh apply
```

`status --json` is the classifier `virtbase-pve-repatch` reads to build its
metrics, so an alert fires on exactly the state `status` shows a human.

`patch.sh` is **idempotent**: each patch is classified before being touched.

| Classification | Meaning | `apply` | `unapply` |
| --- | --- | --- | --- |
| `pending` | would apply cleanly (forward dry-run succeeds) | applies it | no-op |
| `applied` | reverse dry-run succeeds (already in place) | no-op | reverts it |
| `unknown` | neither direction is clean (drifted / partial / wrong) | reports failure, continues to next patch | reports failure, continues to next patch |

Patches are processed independently, so a failure on one patch does **not** stop the others. `pvedaemon` / `pveproxy` are restarted only when at least one patch actually changed state.

Environment overrides:

- `PVE_BASE` — default `/usr/share/perl5/PVE`
- `PATCH_FILES` — space-separated list replacing the default set
- `PATCH_FILE` — apply or revert a single patch only (legacy)
- `SKIP_RESTART=1` — never restart `pvedaemon`/`pveproxy`, even on changes

### Manual apply

```bash
sudo patch --dry-run -d /usr/share/perl5/PVE -p1 < proxmox-snippet-upload.patch
sudo patch -d /usr/share/perl5/PVE -p1 < proxmox-snippet-upload.patch

sudo patch --dry-run -d /usr/share/perl5/PVE -p1 < proxmox-snippet-mode.patch
sudo patch -d /usr/share/perl5/PVE -p1 < proxmox-snippet-mode.patch

sudo patch --dry-run -d /usr/share/perl5/PVE -p1 < proxmox-hookscript.patch
sudo patch -d /usr/share/perl5/PVE -p1 < proxmox-hookscript.patch

sudo systemctl restart pvedaemon pveproxy
```

Why this works:

- Patch paths are stored as `a/API2/...` and `a/Storage.pm`.
- `-d /usr/share/perl5/PVE` sets the base directory.
- `-p1` removes the `a/` prefix.

Apply on all cluster nodes.

## Rollback (unapply patches)

```bash
./patch.sh dry-run-unapply
./patch.sh unapply
```

`patch.sh` reverts in reverse order (hookscript, then snippet mode, then snippet upload) and restarts services only if anything was actually reverted.

### Manual rollback

```bash
sudo patch -R -d /usr/share/perl5/PVE -p1 < proxmox-hookscript.patch
sudo patch -R -d /usr/share/perl5/PVE -p1 < proxmox-snippet-mode.patch
sudo patch -R -d /usr/share/perl5/PVE -p1 < proxmox-snippet-upload.patch
sudo systemctl restart pvedaemon pveproxy
```

## Regenerate patches from Perl sources

Regenerate with context (`-U3`) and ignore CRLF/LF-only differences.

### Snippet upload

```bash
diff --strip-trailing-cr -U3 --label a/API2/Storage/Status.pm --label b/API2/Storage/Status.pm Status.pm.bak Status.pm > proxmox-snippet-upload.patch
diff --strip-trailing-cr -U3 --label a/Storage.pm --label b/Storage.pm Storage.pm.bak Storage.pm >> proxmox-snippet-upload.patch
```

### Snippet mode

Generated against a tree that already has the snippet-upload patch applied, so the two do not overlap:

```bash
diff --strip-trailing-cr -U3 --label a/API2/Storage/Status.pm --label b/API2/Storage/Status.pm Status.pm.upload-patched Status.pm > proxmox-snippet-mode.patch
```

### Hookscript

```bash
diff --strip-trailing-cr -U3 --label a/API2/Qemu.pm --label b/API2/Qemu.pm Qemu.pm Qemu_patched.pm > proxmox-hookscript.patch
```

To avoid the `no newline at end of file` marker in generated diffs, ensure both source files end with a newline before creating a patch.
