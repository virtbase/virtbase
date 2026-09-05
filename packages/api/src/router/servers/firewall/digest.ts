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
 * Read the config digest off a Proxmox firewall response.
 *
 * Proxmox stamps one onto every firewall object it hands out -
 * `copy_list_with_digest` for the rules, `copy_opject_with_digest` for the
 * options - but it declares neither in the endpoint's `returns` schema, so the
 * generated model does not carry the field. Until PVE documents it, reading it
 * takes a cast, and it is worth reading: the digest is what `$put` and
 * `$delete` compare to refuse a write against a ruleset that changed underneath
 * the customer's browser.
 *
 * `undefined` is a valid answer, and every consumer treats it as "no
 * concurrency check" rather than an error - a rule fetched by an older Proxmox,
 * or through the mocks in the tests, simply has none.
 */
export const readFirewallDigest = (value: object): string | undefined => {
  const digest = (value as { digest?: unknown }).digest;
  return typeof digest === "string" ? digest : undefined;
};
