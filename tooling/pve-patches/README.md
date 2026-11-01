# virtbase-pve-patches

A Debian package that applies three patches to Proxmox VE 9 and keeps them
applied across Proxmox upgrades. Together they let an API client manage guest
hookscripts end to end: upload a script as a snippet and attach it to a VM.

| Patch                          | Change                                                                                               | Patched file                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `proxmox-snippet-upload.patch` | The storage upload API accepts the `snippets` content type ([bug 2208][bug-2208])                    | `API2/Storage/Status.pm`, `Storage.pm` |
| `proxmox-snippet-mode.patch`   | An uploaded snippet whose first line starts with `#!` becomes executable; other snippets stay `0644` | `API2/Storage/Status.pm`               |
| `proxmox-hookscript.patch`     | Users with `VM.Config.Options` may set a VM's `hookscript`, which upstream reserves for `root@pam`   | `API2/Qemu.pm`                         |

All paths are relative to `/usr/share/perl5/PVE`. `libpve-storage-perl` owns the
first two files, `qemu-server` the third.

> [!WARNING]
> A hookscript runs as root on the node. With these patches, any user who may
> upload snippets to a storage (`Datastore.AllocateTemplate`) and edit a VM's
> options (`VM.Config.Options`) can run code as root on that node. Grant those
> privileges together only to users you would give root.

## How it stays applied

Upgrading `libpve-storage-perl` or `qemu-server` replaces the patched files and
reverts the patches. The package handles that in three ways:

- **A dpkg file trigger** on `/usr/share/perl5/PVE` reapplies the patches
  whenever a package writes there, including during unattended upgrades. It is
  `interest-noawait`, so it never holds up the package that activated it.
- **A daily systemd timer**, `virtbase-pve-repatch.timer`, catches changes that
  bypass dpkg.
- **Patch state is published** for the Prometheus node_exporter textfile
  collector, because a patch that no longer fits a new Proxmox version cannot
  be reapplied by retrying.

Each patch is in one of three states:

| State     | Meaning                                                       |
| --------- | ------------------------------------------------------------- |
| `applied` | The patch is in place.                                        |
| `pending` | The patch is not applied; the next run applies it.            |
| `unknown` | The patch no longer fits the installed version; it needs work |

A failed reapply never fails the dpkg transaction, so an upgrade cannot leave a
node half-configured. The failure is logged, written to the metrics file, and
reported by the timer's next run as a failed unit.

## Install

Download `virtbase-pve-patches_<version>_all.deb` from the
[releases](https://github.com/virtbase/virtbase/releases?q=pve-patches) and
install it on every node of the cluster:

```bash
apt install ./virtbase-pve-patches_<version>_all.deb
```

Installing applies the patches and restarts `pvedaemon` and `pveproxy`.
Removing the package reverts them:

```bash
apt remove virtbase-pve-patches
```

## Operate

```bash
virtbase-pve-repatch            # reapply, restart the API daemons if needed, publish the state
virtbase-pve-repatch status     # only classify and publish
/usr/share/virtbase-pve-patches/patch.sh status
```

`virtbase-pve-repatch` exits non-zero while any patch is not applied. See
`man virtbase-pve-repatch` for its options. Settings go in
`/etc/default/virtbase-pve-repatch`:

```sh
TEXTFILE_DIR=/var/lib/prometheus/node-exporter
SKIP_RESTART=1
```

## Monitor

The metrics file, `virtbase_pve_patches.prom`, is written to `TEXTFILE_DIR` if
that directory exists. Point the node_exporter textfile collector at it:

```text
virtbase_pve_patch_state{patch="proxmox-hookscript.patch"} 1
virtbase_pve_patch_last_run_timestamp_seconds 1767225600
```

`1` is applied, `0` pending and `-1` unknown. Two alerts cover it:

| Expression                                                    | Meaning                              |
| ------------------------------------------------------------- | ------------------------------------ |
| `virtbase_pve_patch_state == -1`                              | a patch needs to be rebased          |
| `time() - virtbase_pve_patch_last_run_timestamp_seconds > 2d` | neither trigger nor timer is running |

The unit state of `virtbase-pve-repatch.service` carries the same signal for
systemd-based monitoring.

## Compatibility

The patches target Proxmox VE 9 on Debian trixie. A scheduled workflow checks
them every day against the newest `libpve-storage-perl` and `qemu-server` in the
`pve-no-subscription` and `pve-test` repositories:

- when a patch no longer applies, or upstream already contains it, it opens an
  issue;
- when the patches still apply but at moved line numbers, it opens a pull
  request that rebases them.

Patches apply with `--fuzz=0`, so a change to the surrounding code makes a patch
`unknown` rather than letting it land in the wrong place.

## Develop

| Path                   | Purpose                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `patch.sh`             | applies, reverts and classifies the patches; runs from a checkout |
| `virtbase-pve-repatch` | the installed entry point: reapply, then publish the state        |
| `debian/`              | packaging (debhelper, compat 13)                                  |
| `scripts/upstream.sh`  | fetches the upstream packages, checks and rebases the patches     |
| `tests/lifecycle.sh`   | installs, retriggers and removes the package in a container       |
| `version.txt`          | the package version, maintained by release-please                 |

```bash
./build.sh                               # dist/virtbase-pve-patches_<version>_all.deb, checked by lintian
./tests/lifecycle.sh dist/*.deb          # install, trigger and remove against the real upstream files
./scripts/upstream.sh check              # do the patches fit the newest upstream packages?
./scripts/upstream.sh refresh            # rebase the patches onto pve-no-subscription
PVE_BASE=/path/to/PVE ./patch.sh status  # classify against any copy of the tree
```

`build.sh` needs Docker and builds in `debian:trixie`; `BUILD_IMAGE` overrides
the image. `debian/changelog` is generated from `version.txt`, dated by the last
commit that touched this directory, so a commit always builds the same package.

### Changing a patch

`patch.sh` recognises an applied patch by reverse-applying it, so it only
recognises output it produced itself. After you change what a patch writes, a
node with the old version classifies it as `unknown`. Restore the stock file on
each node and let the trigger reapply the new version:

```bash
apt install --reinstall libpve-storage-perl   # or qemu-server
```

To write a new patch, edit a copy of the tree and diff it against the stock
files with `diff -u --label a/<path> --label b/<path>`, from
`/usr/share/perl5/PVE`. Add it to `DEFAULT_PATCH_FILES` in `patch.sh`, which
also sets the order: a patch generated on top of another must come after it.

## Release

Commits that touch this directory feed a release-please pull request. Merging it
tags `pve-patches-v<version>`, and the release workflow builds the package and
attaches it to the GitHub release with a checksum and a build provenance
attestation.

## Licence

AGPL-3.0-or-later.

[bug-2208]: https://bugzilla.proxmox.com/show_bug.cgi?id=2208
