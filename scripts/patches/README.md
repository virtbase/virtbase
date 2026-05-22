Proxmox VE patches used by Virtbase for snippet storage and VM hook scripts.

Without the snippet-upload patch, custom cloud-init snippets cannot be uploaded for VMs.
Without the hookscript patch, the `hookscript` VM option is not accepted in general VM config updates.

Reference issue (snippet upload):
https://bugzilla.proxmox.com/show_bug.cgi?id=2208

Original snippet-upload patch:
https://bugzilla.proxmox.com/attachment.cgi?id=389

Tested with:
- Proxmox VE 9.1.5

## Patch files in this directory

Both patches are unified diffs with `-U3` and share the same apply base (`/usr/share/perl5/PVE`, `-p1`).

| Patch | Target file(s) on Proxmox |
| --- | --- |
| `proxmox-snippet-upload.patch` | `API2/Storage/Status.pm`, `Storage.pm` |
| `proxmox-hookscript.patch` | `API2/Qemu.pm` |

### Snippet upload (`proxmox-snippet-upload.patch`)

Updates:

- `/usr/share/perl5/PVE/API2/Storage/Status.pm` — allow `snippets` content type on upload
- `/usr/share/perl5/PVE/Storage.pm` — add `get_snippet_dir`

Applying one patch for both files is expected and correct.

### Hookscript (`proxmox-hookscript.patch`)

Updates:

- `/usr/share/perl5/PVE/API2/Qemu.pm` — add `hookscript` to `$generaloptions`

## Apply patches on a Proxmox node

Copy the patch files to the node, then use the helper script (recommended):

```bash
./patch.sh dry-run-apply
./patch.sh apply
```

`patch.sh` applies both patches in order (snippet upload, then hookscript) and restarts `pvedaemon` and `pveproxy`.

Environment overrides:

- `PVE_BASE` — default `/usr/share/perl5/PVE`
- `PATCH_FILES` — space-separated list replacing the default pair
- `PATCH_FILE` — apply or revert a single patch only (legacy)

### Manual apply

```bash
sudo patch --dry-run -d /usr/share/perl5/PVE -p1 < proxmox-snippet-upload.patch
sudo patch -d /usr/share/perl5/PVE -p1 < proxmox-snippet-upload.patch

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

`patch.sh` reverts in reverse order (hookscript, then snippet upload) and restarts services.

### Manual rollback

```bash
sudo patch -R -d /usr/share/perl5/PVE -p1 < proxmox-hookscript.patch
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

### Hookscript

```bash
diff --strip-trailing-cr -U3 --label a/API2/Qemu.pm --label b/API2/Qemu.pm Qemu.pm Qemu_patched.pm > proxmox-hookscript.patch
```

To avoid the `no newline at end of file` marker in generated diffs, ensure both source files end with a newline before creating a patch.
