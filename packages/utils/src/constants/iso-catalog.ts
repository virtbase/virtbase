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

/**
 * A curated, Virtbase-vetted ISO image offered in the custom image dialog.
 *
 * Entries are shown in declaration order and are presented to the customer as
 * trusted, so every URL must point at the vendor's own download host - never a
 * random mirror.
 */
export interface IsoCatalogEntry {
  /**
   * Stable identifier used as the selection value in the UI.
   * Never reuse an id for a different image.
   */
  id: string;
  /**
   * The display name, also pre-filled into the ISO name field, so it has to
   * satisfy the same 1-64 character limit as a user-typed name.
   */
  name: string;
  /**
   * Path to the distribution logo below `apps/web/public`. Must stay
   * same-origin: the CSP only allows `img-src 'self'` plus Virtbase hosts.
   * `null` falls back to the generic disc icon.
   */
  icon: string | null;
  /**
   * Direct https URL to the `.iso`, pre-filled into the URL field. It still
   * passes through the same validation and SSRF checks as a user-typed URL, so
   * it must be https, resolve publicly, end in `.iso`, redirect at most three
   * times and answer a HEAD request with a `Content-Length` below
   * `MAX_ISO_DOWNLOAD_SIZE_BYTES`.
   */
  url: string;
  /**
   * SHA-256 of the image as published by the vendor, handed to Proxmox so it
   * verifies the download and aborts on a mismatch.
   *
   * Only ever set this on a URL whose bytes cannot change. A `-latest-` alias
   * is repointed at every point release, so pinning a hash there turns into a
   * failing download the day the vendor ships an update - those stay `null`.
   */
  sha256: string | null;
  /**
   * Release date of this specific image as `YYYY-MM-DD`, taken from the ISO's
   * `Last-Modified` header. Parsed at render time, so it stays a plain string
   * here.
   */
  releasedAt: string;
}

/**
 * Because this is a constant rather than a database table, a point release
 * means a code change. Where a vendor publishes a stable `-latest-` path we use
 * it and leave `sha256` null, so those entries keep working untouched and only
 * their `releasedAt` drifts.
 *
 * When changing an entry, re-check the URL first:
 * `curl -sIL --max-redirs 3 <url>` must end in a `200` carrying a
 * `Content-Length`, and `bun test` in `packages/api` guards the rest.
 */
export const ISO_CATALOG: readonly IsoCatalogEntry[] = [
  {
    id: "debian-13",
    name: "Debian 13 (trixie)",
    icon: "/assets/static/distros/debian.svg",
    url: "https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-13.6.0-amd64-netinst.iso",
    sha256: "65273beed27b2df543b68b65630ba525cfbad8df2b12035732b2dff87d6664e7",
    releasedAt: "2026-07-11",
  },
  {
    id: "debian-12",
    name: "Debian 12 (bookworm)",
    icon: "/assets/static/distros/debian.svg",
    url: "https://cdimage.debian.org/cdimage/archive/12.11.0/amd64/iso-cd/debian-12.11.0-amd64-netinst.iso",
    sha256: "30ca12a15cae6a1033e03ad59eb7f66a6d5a258dcf27acd115c2bd42d22640e8",
    releasedAt: "2025-05-17",
  },
  {
    id: "ubuntu-26-04-lts",
    name: "Ubuntu Server 26.04 LTS",
    icon: "/assets/static/distros/ubuntu.svg",
    url: "https://releases.ubuntu.com/26.04/ubuntu-26.04-live-server-amd64.iso",
    sha256: "dec49008a71f6098d0bcfc822021f4d042d5f2db279e4d75bdd981304f1ca5d9",
    releasedAt: "2026-04-20",
  },
  {
    id: "ubuntu-24-04-lts",
    name: "Ubuntu Server 24.04 LTS",
    icon: "/assets/static/distros/ubuntu.svg",
    url: "https://releases.ubuntu.com/24.04/ubuntu-24.04.4-live-server-amd64.iso",
    sha256: "e907d92eeec9df64163a7e454cbc8d7755e8ddc7ed42f99dbc80c40f1a138433",
    releasedAt: "2026-02-10",
  },
  {
    id: "ubuntu-22-04-lts",
    name: "Ubuntu Server 22.04 LTS",
    icon: "/assets/static/distros/ubuntu.svg",
    url: "https://releases.ubuntu.com/22.04/ubuntu-22.04.5-live-server-amd64.iso",
    sha256: "9bc6028870aef3f74f4e16b900008179e78b130e6b0b9a140635434a46aa98b0",
    releasedAt: "2024-09-11",
  },
  {
    id: "almalinux-10",
    name: "AlmaLinux 10",
    icon: "/assets/static/distros/almalinux.svg",
    url: "https://repo.almalinux.org/almalinux/10/isos/x86_64/AlmaLinux-10-latest-x86_64-minimal.iso",
    sha256: null,
    releasedAt: "2026-05-23",
  },
  {
    id: "almalinux-9",
    name: "AlmaLinux 9",
    icon: "/assets/static/distros/almalinux.svg",
    url: "https://repo.almalinux.org/almalinux/9/isos/x86_64/AlmaLinux-9-latest-x86_64-minimal.iso",
    sha256: null,
    releasedAt: "2026-05-24",
  },
  {
    id: "rocky-10",
    name: "Rocky Linux 10",
    icon: "/assets/static/distros/rocky.svg",
    url: "https://download.rockylinux.org/pub/rocky/10/isos/x86_64/Rocky-10-latest-x86_64-minimal.iso",
    sha256: null,
    releasedAt: "2026-05-27",
  },
  {
    id: "rocky-9",
    name: "Rocky Linux 9",
    icon: "/assets/static/distros/rocky.svg",
    url: "https://download.rockylinux.org/pub/rocky/9/isos/x86_64/Rocky-9-latest-x86_64-minimal.iso",
    sha256: null,
    releasedAt: "2026-05-26",
  },
  {
    id: "centos-stream-10",
    name: "CentOS Stream 10",
    icon: "/assets/static/distros/centos.svg",
    url: "https://mirror.stream.centos.org/10-stream/BaseOS/x86_64/iso/CentOS-Stream-10-latest-x86_64-boot.iso",
    sha256: null,
    releasedAt: "2026-08-18",
  },
  {
    id: "centos-stream-9",
    name: "CentOS Stream 9",
    icon: "/assets/static/distros/centos.svg",
    url: "https://mirror.stream.centos.org/9-stream/BaseOS/x86_64/iso/CentOS-Stream-9-latest-x86_64-boot.iso",
    sha256: null,
    releasedAt: "2026-08-18",
  },
  {
    id: "fedora-server-44",
    name: "Fedora Server 44",
    icon: "/assets/static/distros/fedora.svg",
    url: "https://download.fedoraproject.org/pub/fedora/linux/releases/44/Server/x86_64/iso/Fedora-Server-netinst-x86_64-44-1.7.iso",
    sha256: "ae20c06bea746913cadea7d80463e13f4bf55bee4df2918111c921c674b70283",
    releasedAt: "2026-04-22",
  },
  {
    id: "alpine-3-24",
    name: "Alpine Linux 3.24",
    icon: "/assets/static/distros/alpine.svg",
    url: "https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86_64/alpine-virt-3.24.1-x86_64.iso",
    sha256: "e73a6241bd5f3c5c2d4d38c02cc52c378c0415a7c888bd292066bf36e0f41a39",
    releasedAt: "2026-06-13",
  },
  {
    id: "arch-linux",
    name: "Arch Linux",
    icon: "/assets/static/distros/archlinux.svg",
    url: "https://geo.mirror.pkgbuild.com/iso/latest/archlinux-x86_64.iso",
    sha256: null,
    releasedAt: "2026-08-01",
  },
  {
    id: "nixos-26-05",
    name: "NixOS 26.05",
    icon: "/assets/static/distros/nixos.svg",
    url: "https://channels.nixos.org/nixos-26.05/latest-nixos-minimal-x86_64-linux.iso",
    sha256: null,
    releasedAt: "2026-08-23",
  },
  {
    id: "freebsd-15-1",
    name: "FreeBSD 15.1",
    icon: "/assets/static/distros/freebsd.svg",
    url: "https://download.freebsd.org/releases/amd64/amd64/ISO-IMAGES/15.1/FreeBSD-15.1-RELEASE-amd64-disc1.iso",
    sha256: "fa27646f05a1440fd26ffbb85e06a50bc86e128242a4e9cb7bb3ea76e1aa5fd9",
    releasedAt: "2026-06-12",
  },
  {
    id: "windows-server-2025-eval",
    name: "Windows Server 2025 (Evaluation)",
    icon: "/assets/static/distros/windows.svg",
    url: "https://software-static.download.prss.microsoft.com/dbazure/888969d5-f34g-4e03-ac9d-1f9786c66749/26100.1742.240906-0331.ge_release_svc_refresh_SERVER_EVAL_x64FRE_en-us.iso",
    // Microsoft publishes the hash on the Evaluation Center page only, not as a
    // file next to the image, so there is nothing to pin without transcribing
    // it by hand.
    sha256: null,
    releasedAt: "2024-09-19",
  },
  {
    id: "windows-11-ltsc-eval",
    name: "Windows 11 Enterprise LTSC (Evaluation)",
    icon: "/assets/static/distros/windows.svg",
    url: "https://software-static.download.prss.microsoft.com/dbazure/888969d5-f34g-4e03-ac9d-1f9786c66749/26100.1742.240906-0331.ge_release_svc_refresh_CLIENT_LTSC_EVAL_x64FRE_en-us.iso",
    sha256: null,
    releasedAt: "2024-09-19",
  },
  {
    id: "virtio-win",
    name: "VirtIO Drivers for Windows",
    // A driver disc rather than a distribution - the generic disc icon says
    // that better than a borrowed logo would.
    icon: null,
    // The unversioned `virtio-win.iso` alias redirects four times, one hop past
    // what `getSafeIsoDownloadSizeBytes` follows, so the version is pinned.
    url: "https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/stable-virtio/virtio-win-0.1.285.iso",
    // Upstream only publishes MD5 sums, and only for the RPMs - there is no
    // vendor hash for the image itself to pin.
    sha256: null,
    releasedAt: "2025-09-12",
  },
  {
    id: "proxmox-ve-9",
    name: "Proxmox VE 9.2",
    icon: "/assets/static/distros/proxmox.svg",
    url: "https://enterprise.proxmox.com/iso/proxmox-ve_9.2-1.iso",
    sha256: "4e88fe416df9b527624a175f24c9aa07c714d3332afb1ee3dbf3879573ef2c6c",
    releasedAt: "2026-05-21",
  },
  {
    id: "proxmox-backup-server-4",
    name: "Proxmox Backup Server 4.2",
    icon: "/assets/static/distros/proxmox.svg",
    url: "https://enterprise.proxmox.com/iso/proxmox-backup-server_4.2-1.iso",
    sha256: "2fb299deac3929253712c9c3dfc9237edbe70af83c8848467616b771a1d5453e",
    releasedAt: "2026-04-28",
  },
  {
    id: "proxmox-mail-gateway-9",
    name: "Proxmox Mail Gateway 9.1",
    icon: "/assets/static/distros/proxmox.svg",
    url: "https://enterprise.proxmox.com/iso/proxmox-mail-gateway_9.1-1.iso",
    sha256: "79402f6398c50a76fca66a32c3c0a50da3f71d35c1d7a1bea022e4b1c6c864d6",
    releasedAt: "2026-06-10",
  },
  {
    id: "kali-2026-2",
    name: "Kali Linux 2026.2",
    icon: "/assets/static/distros/kali.svg",
    url: "https://cdimage.kali.org/current/kali-linux-2026.2-installer-amd64.iso",
    sha256: "6dbefacc95e3b556c19c48e8bae39b8b505e2d3a1aba0bfb7ab62b036c3d2ba3",
    releasedAt: "2026-06-16",
  },
] as const;

/**
 * The catalog entry a stored ISO download came from, matched on the URL that
 * was handed to Proxmox.
 *
 * The URL is the only link back to the catalog: `proxmox_iso_downloads` records
 * the name and URL a customer submitted, not which entry they picked. That also
 * makes the match trustworthy on the server, where the URL has already been
 * validated - a client cannot claim to be a catalog entry it is not.
 *
 * Renaming an entry keeps working, changing its URL does not: rows created
 * before the change stop matching and fall back to the generic disc icon.
 */
export function findIsoCatalogEntry(url: string): IsoCatalogEntry | undefined {
  return ISO_CATALOG.find((entry) => entry.url === url);
}
