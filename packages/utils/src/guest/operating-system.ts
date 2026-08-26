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
 * One operating system Virtbase can put a face on.
 *
 * The catalog is the single answer to "which logo and which name", shared by
 * the dashboard, the API and the Discord bot. It lives in `@virtbase/utils`
 * rather than next to any of them because all three are allowed to import
 * layer 0 and none of them may import each other.
 */
export interface OperatingSystemDescriptor {
  /**
   * Stable identifier, and the basename of the logo under
   * `apps/web/public/assets/static/distros`. Never reuse a slug for a
   * different operating system - Discord emoji names are derived from it.
   */
  slug: string;
  /**
   * The vendor's own short name. Deliberately untranslated: distributions are
   * proper nouns and are not localised.
   */
  label: string;
  /**
   * Path to the logo below `apps/web/public`. Must stay same-origin - the CSP
   * only allows `img-src 'self'` plus the Virtbase hosts.
   */
  icon: string;
  /**
   * `os-release` IDs, as `guest-get-osinfo` reports them, that resolve here.
   *
   * Matched exactly and before {@link OperatingSystemDescriptor.match}, so a
   * guest that identifies itself precisely never depends on a regex.
   */
  ids: readonly string[];
  /**
   * Fallback for free text: a template name, an ISO name, a `PRETTY_NAME`.
   *
   * Only consulted when no `id` matched, which is why it can afford to be
   * loose. [!] Applied to guest-controlled text, so it must not backtrack
   * catastrophically - keep these free of nested quantifiers.
   */
  match: RegExp;
}

/**
 * The `id` QEMU reports for a Windows guest.
 *
 * Every guest inspection Virtbase does - listening sockets, firewall rules -
 * assumes POSIX tooling, so this is the flag that keeps those probes from
 * running commands that cannot exist.
 */
export const WINDOWS_OS_ID = "mswindows";

/** Where the logos live, so the path is written once. */
const logo = (slug: string) => `/assets/static/distros/${slug}.svg`;

/**
 * Order matters: the first match wins, so a more specific entry has to come
 * before the family it belongs to. `almalinux` and `rocky` before `centos`,
 * because both describe themselves as CentOS-compatible in their names, and
 * every named distribution before the generic `linux` catch-all.
 */
export const OPERATING_SYSTEMS: readonly OperatingSystemDescriptor[] = [
  {
    slug: "almalinux",
    label: "AlmaLinux",
    icon: logo("almalinux"),
    ids: ["almalinux", "alma"],
    match: /alma/i,
  },
  {
    slug: "rocky",
    label: "Rocky Linux",
    icon: logo("rocky"),
    ids: ["rocky"],
    match: /rocky/i,
  },
  {
    slug: "centos",
    label: "CentOS",
    icon: logo("centos"),
    ids: ["centos"],
    match: /cent\s*os/i,
  },
  {
    slug: "debian",
    label: "Debian",
    icon: logo("debian"),
    ids: ["debian", "raspbian"],
    match: /debian|raspbian/i,
  },
  {
    slug: "ubuntu",
    label: "Ubuntu",
    icon: logo("ubuntu"),
    ids: ["ubuntu", "linuxmint", "pop", "elementary", "zorin"],
    match: /ubuntu|mint|pop!?_?os|elementary|zorin/i,
  },
  {
    slug: "fedora",
    label: "Fedora",
    icon: logo("fedora"),
    // `rhel` sits here rather than in its own entry: there is no Red Hat logo
    // in the asset set, and Fedora is the family it belongs to.
    ids: ["fedora", "rhel", "redhat", "ol", "oracle", "scientific"],
    match: /fedora|red\s*hat|rhel|oracle\s*linux/i,
  },
  {
    slug: "alpine",
    label: "Alpine Linux",
    icon: logo("alpine"),
    ids: ["alpine"],
    match: /alpine/i,
  },
  {
    slug: "archlinux",
    label: "Arch Linux",
    icon: logo("archlinux"),
    ids: ["arch", "archarm", "manjaro", "endeavouros", "garuda"],
    match: /arch\s*linux|manjaro|endeavour|garuda/i,
  },
  {
    slug: "kali",
    label: "Kali Linux",
    icon: logo("kali"),
    ids: ["kali"],
    match: /kali/i,
  },
  {
    slug: "nixos",
    label: "NixOS",
    icon: logo("nixos"),
    ids: ["nixos"],
    match: /nix\s*os/i,
  },
  {
    slug: "freebsd",
    label: "FreeBSD",
    icon: logo("freebsd"),
    ids: ["freebsd", "openbsd", "netbsd"],
    match: /(free|open|net)bsd/i,
  },
  {
    slug: "windows",
    label: "Windows",
    icon: logo("windows"),
    ids: [WINDOWS_OS_ID],
    match: /windows|win\s*(server|10|11)/i,
  },
  {
    slug: "proxmox",
    label: "Proxmox VE",
    icon: logo("proxmox"),
    ids: ["pve", "proxmox"],
    match: /proxmox/i,
  },
  {
    slug: "3cx",
    label: "3CX",
    icon: logo("3cx"),
    ids: ["3cx"],
    match: /3cx/i,
  },
  {
    // Last on purpose: the catch-all for a distribution we have no logo for.
    // A guest that says `ID=void` still gets a Linux mark rather than the
    // generic disc that means "we have no idea what this is".
    slug: "linux",
    label: "Linux",
    icon: logo("linux"),
    ids: ["linux", "gentoo", "slackware", "void", "opensuse", "sles", "suse"],
    match: /\blinux\b|gentoo|slackware|\bsuse\b/i,
  },
];

/** Indexed once - the catalog is a module constant and never changes. */
const BY_ID = new Map(
  OPERATING_SYSTEMS.flatMap((entry) =>
    entry.ids.map((id) => [id, entry] as const),
  ),
);

/**
 * The upper bound on any guest-supplied name we keep.
 *
 * `PRETTY_NAME` comes out of `/etc/os-release` inside the customer's server,
 * so it is attacker-controlled text that ends up in the dashboard, in Discord
 * embeds and in the API. 128 characters is well past every real distribution
 * and short enough that it can never dominate a layout.
 */
export const MAX_GUEST_OS_NAME_LENGTH = 128;

/**
 * Whether a code point must not survive into a stored name.
 *
 * Covers the C0 and C1 control ranges plus the zero-width and bidirectional
 * formatting characters - those are the ones that let a name render as
 * something other than what it says, which matters because this text is
 * written by the customer inside their own server.
 *
 * Written as a predicate rather than a character class so the ranges stay
 * legible and no literal control character ever appears in this file.
 */
const isFormattingCodePoint = (codePoint: number): boolean =>
  codePoint < 0x20 ||
  (codePoint >= 0x7f && codePoint <= 0x9f) ||
  (codePoint >= 0x200b && codePoint <= 0x200f) ||
  (codePoint >= 0x202a && codePoint <= 0x202e) ||
  (codePoint >= 0x2066 && codePoint <= 0x2069);

/**
 * Makes a guest-reported name safe to store and render.
 *
 * Strips formatting characters, collapses whitespace and caps the length.
 * Returns `null` for anything that is empty once cleaned, so an unusable name
 * is indistinguishable from an absent one.
 */
export const sanitizeGuestOsName = (
  value: string | null | undefined,
): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && isFormattingCodePoint(codePoint)
      ? " "
      : character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_GUEST_OS_NAME_LENGTH)
    .trim();

  return cleaned.length > 0 ? cleaned : null;
};

export interface ResolveOperatingSystemInput {
  /** An `os-release` ID from `guest-get-osinfo`. Matched exactly, first. */
  id?: string | null;
  /**
   * Free text to fall back on - a `PRETTY_NAME`, a template name, an ISO name
   * and its URL. Anything the caller has; they are joined before matching.
   */
  text?: readonly (string | null | undefined)[] | string | null;
}

/**
 * Picks the operating system a guest, a template or an ISO refers to.
 *
 * The `id` is tried first and exactly, because a guest that identifies itself
 * through `os-release` is telling us the answer and should not be re-guessed
 * from prose. Free text is the fallback, and is what a template or an ISO -
 * neither of which has an `os-release` - is matched on.
 *
 * Returns `null` when nothing matched, which callers render as the generic
 * disc rather than inventing a family.
 */
export const resolveOperatingSystem = ({
  id,
  text,
}: ResolveOperatingSystemInput): OperatingSystemDescriptor | null => {
  if (typeof id === "string") {
    const byId = BY_ID.get(id.trim().toLowerCase());
    if (byId) {
      return byId;
    }
  }

  const haystack = (Array.isArray(text) ? text : [text])
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  if (haystack.length === 0) {
    return null;
  }

  return OPERATING_SYSTEMS.find((entry) => entry.match.test(haystack)) ?? null;
};
