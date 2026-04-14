For snippet upload to work on Proxmox VE, a patch needs to be applied.
Without this patch, custom cloud-init snippets cannot be uploaded for VMs.

Reference issue:
https://bugzilla.proxmox.com/show_bug.cgi?id=2208

Original patch:
https://bugzilla.proxmox.com/attachment.cgi?id=389

Tested with:
- Proxmox VE 9.1.5

## Files patched on Proxmox

The combined patch updates both target files:

- `/usr/share/perl5/PVE/API2/Storage/Status.pm`
- `/usr/share/perl5/PVE/Storage.pm`

Applying one patch for both files is expected and correct.

## Patch file in this directory

- `proxmox-snippet-upload.patch` (unified diff with `-U3`)

## Apply patch on a Proxmox node

Copy `proxmox-snippet-upload.patch` to the node, then run:

```bash
sudo patch --dry-run -d /usr/share/perl5/PVE -p1 < proxmox-snippet-upload.patch
sudo patch -d /usr/share/perl5/PVE -p1 < proxmox-snippet-upload.patch
sudo systemctl restart pvedaemon pveproxy
```

Or use the helper script from this directory:

```bash
./patch.sh dry-run-apply
./patch.sh apply
```

Why this works:
- The patch stores paths as `a/API2/Storage/Status.pm` and `a/Storage.pm`.
- `-d /usr/share/perl5/PVE` sets the base directory.
- `-p1` removes the `a/` prefix.

Result:
- `API2/Storage/Status.pm` resolves to `/usr/share/perl5/PVE/API2/Storage/Status.pm`
- `Storage.pm` resolves to `/usr/share/perl5/PVE/Storage.pm`

Apply on all cluster nodes.

## Rollback (unapply patch)

```bash
sudo patch -R -d /usr/share/perl5/PVE -p1 < proxmox-snippet-upload.patch
sudo systemctl restart pvedaemon pveproxy
```

Or:

```bash
./patch.sh dry-run-unapply
./patch.sh unapply
```

## Regenerate patch from Perl files

Regenerate with context (`-U3`) and ignore CRLF/LF-only differences:

```bash
diff --strip-trailing-cr -U3 --label a/API2/Storage/Status.pm --label b/API2/Storage/Status.pm Status.pm.bak Status.pm > proxmox-snippet-upload.patch
diff --strip-trailing-cr -U3 --label a/Storage.pm --label b/Storage.pm Storage.pm.bak Storage.pm >> proxmox-snippet-upload.patch
```

To avoid the `no newline at end of file` marker in generated diffs, ensure both source files end with a newline before creating the patch.