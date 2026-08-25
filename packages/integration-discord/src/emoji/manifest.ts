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
 * One application emoji this package owns.
 *
 * `match` is tried against a template's name and its icon path, so
 * "Debian 12 (Bookworm)" and "/assets/static/distros/debian.svg" both resolve
 * to the same emoji without the template table having to know about Discord.
 */
export interface EmojiDescriptor {
  /** Discord emoji name: alphanumeric and underscores, 2-32 characters. */
  name: string;
  /** File under `assets/emoji`, produced by `scripts/rasterize-emojis.ts`. */
  file: string;
  match: RegExp;
}

/**
 * Prefix for every emoji this package uploads.
 *
 * The reconciler only ever deletes names carrying it, so an emoji added by
 * hand in the developer portal survives a sync.
 */
export const EMOJI_PREFIX = "vb_";

const distro = (slug: string, match: RegExp): EmojiDescriptor => ({
  name: `${EMOJI_PREFIX}${slug}`,
  file: `${slug}.png`,
  match,
});

/**
 * Order matters: the first match wins, so a more specific pattern has to come
 * before the family it belongs to. `almalinux` and `rocky` before `centos`,
 * because both describe themselves as CentOS-compatible in their names.
 */
export const EMOJI_MANIFEST: EmojiDescriptor[] = [
  distro("almalinux", /alma/i),
  distro("rocky", /rocky/i),
  distro("centos", /cent\s*os/i),
  distro("debian", /debian/i),
  distro("ubuntu", /ubuntu/i),
  distro("fedora", /fedora/i),
  distro("alpine", /alpine/i),
  distro("archlinux", /arch/i),
  distro("kali", /kali/i),
  distro("nixos", /nix/i),
  distro("freebsd", /(free)?bsd/i),
  distro("windows", /windows|win\s*(server|10|11)/i),
  distro("proxmox", /proxmox/i),
  distro("3cx", /3cx/i),
];
