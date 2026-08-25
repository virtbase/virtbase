/*
 *   Copyright (c) 2026 Janic Bellmann
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { RenderableSnippet } from "./types";

/**
 * The snippets that replace what `scripts/create-templates.sh` used to bake
 * into every image with `virt-customize`.
 *
 * Seeded into `cloud_init_snippets` rather than hardcoded, so an operator can
 * edit them in the admin console; this array is the initial content and the
 * reference for what a correct base looks like. Priorities leave gaps so a
 * custom snippet can be ordered between two of them without renumbering.
 *
 * What deliberately did *not* survive the move:
 *
 * - `datasource_list` in `/etc/cloud/cloud.cfg.d/99-proxmox.cfg`. The datasource
 *   is resolved before vendor data is read, so writing it here would be too
 *   late to matter; it only ever trimmed boot-time probing.
 * - `cloud-init clean` and truncating `/etc/machine-id`. Both existed because a
 *   template VM was cloned. Every guest now starts from a pristine image.
 */
export const BASE_SNIPPETS: RenderableSnippet[] = [
  {
    slug: "base-cloud-init",
    kind: "cloud-config",
    priority: 10,
    targets: {},
    content: `# Replaces the sed rewrites of /etc/cloud/cloud.cfg in the old bake step.
# These are cloud-init's own options - editing cloud.cfg was always the long
# way round to set them.
ssh_pwauth: true
disable_root: false
`,
  },
  {
    slug: "base-guest-agent",
    kind: "cloud-config",
    priority: 20,
    // Every family whose cloud images ship a package by this name. FreeBSD's
    // is `qemu-guest-agent` under pkg but needs a different service name, so it
    // gets its own snippet below.
    targets: { packageManager: ["apt", "dnf", "yum", "apk"] },
    content: `# Replaces \`virt-customize --install qemu-guest-agent\`.
# Installed at first boot instead of baked in, so the agent answers a few tens
# of seconds after boot rather than immediately.
packages:
  - qemu-guest-agent
runcmd:
  - [ sh, -c, 'systemctl enable --now qemu-guest-agent 2>/dev/null || rc-service qemu-guest-agent start 2>/dev/null || true' ]
`,
  },
  {
    slug: "base-remove-default-users",
    kind: "cloud-config",
    priority: 30,
    targets: {},
    content: `# Replaces the userdel sweep in the old bake step. Cloud images ship a distro
# default account; Proxmox provisions root, so the default one is dead weight.
runcmd:
  - [ sh, -c, 'for u in almalinux alpine arch centos cloud-user debian ec2-user fedora opc rocky ubuntu; do userdel -f -r "$u" 2>/dev/null || true; done' ]
`,
  },
  {
    slug: "base-sshd-dropin",
    kind: "cloud-config",
    priority: 40,
    // Only where sshd actually reads sshd_config.d: Debian 12+, Ubuntu 22.04+,
    // RHEL 9+, Fedora and Alpine. FreeBSD has no Include, so writing the file
    // there would be a no-op that merely looks like it worked - it gets
    // `base-sshd-inline` instead.
    //
    // A RHEL-family image older than 9 would need the same treatment. Selectors
    // are a conjunction, so "freebsd OR rhel<9" cannot be one row; add a second
    // narrow snippet if such an image is ever offered.
    targets: { osFamily: ["debian", "ubuntu", "rhel", "fedora", "alpine"] },
    content: `# Replaces the sshd_config sed rewrites. A drop-in rather than an in-place
# edit, so an OS upgrade that rewrites sshd_config does not silently revert it.
write_files:
  - path: /etc/ssh/sshd_config.d/60-virtbase.conf
    permissions: '0644'
    content: |
      PermitRootLogin yes
      PasswordAuthentication yes
      MaxAuthTries 20
runcmd:
  - [ sh, -c, 'systemctl reload sshd 2>/dev/null || systemctl reload ssh 2>/dev/null || service sshd reload 2>/dev/null || true' ]
`,
  },
  {
    slug: "base-guest-agent-freebsd",
    kind: "cloud-config",
    priority: 20,
    // Same intent as `base-guest-agent`, different service manager. Without
    // this a FreeBSD guest has no agent at all, and every agent-backed feature
    // silently reports the server as unreachable rather than as unsupported.
    targets: { packageManager: ["pkg"] },
    content: `packages:
  - qemu-guest-agent
runcmd:
  - [ sh, -c, 'sysrc qemu_guest_agent_enable=YES >/dev/null 2>&1 || true' ]
  - [ sh, -c, 'service qemu-guest-agent start >/dev/null 2>&1 || true' ]
`,
  },
  {
    slug: "base-sshd-inline",
    kind: "shell",
    priority: 45,
    // The demonstration that per-image customisation is now data: images with
    // no drop-in support need the same outcome by a different route.
    targets: { osFamily: ["freebsd"] },
    content: `#!/bin/sh
# sshd on these images has no Include for sshd_config.d, so the drop-in written
# by base-sshd-dropin is never read. Edit the file itself instead, idempotently.
config=/etc/ssh/sshd_config
[ -f "$config" ] || exit 0

set_option() {
  key="$1"
  value="$2"
  if grep -qE "^[#[:space:]]*\${key}[[:space:]]" "$config"; then
    sed -i.bak -E "s|^[#[:space:]]*\${key}[[:space:]].*|\${key} \${value}|" "$config"
  else
    printf '%s %s\\n' "$key" "$value" >> "$config"
  fi
}

set_option PermitRootLogin yes
set_option PasswordAuthentication yes
set_option MaxAuthTries 20

service sshd reload 2>/dev/null || true
`,
  },
];
