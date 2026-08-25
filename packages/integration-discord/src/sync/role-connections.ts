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

import { getRoleConnectionMetadata, putRoleConnectionMetadata } from "../api";
import { roleConnectionsMetadata } from "../role-connections-metadata";
import { canonical } from "./canonical";
import type { Reconciler } from "./types";

const COMPARED = [
  "key",
  "name",
  "name_localizations",
  "description",
  "description_localizations",
  "type",
] as const;

const byKey = (a: { key: string }, b: { key: string }) =>
  a.key.localeCompare(b.key);

/**
 * Registers the metadata a Discord server can grant linked roles from.
 *
 * Discord caps this at five records, and rejects the whole payload when it is
 * exceeded. Refusing locally keeps that from reading as an opaque 400 on a
 * health probe.
 */
export const reconcileRoleConnections: Reconciler = async (client) => {
  const desired = roleConnectionsMetadata.slice().sort(byKey);

  if (desired.length > 5) {
    return {
      name: "role-connections",
      changed: false,
      error: `Discord allows at most 5 role connection metadata records, ${desired.length} are declared`,
    };
  }

  const live = (await getRoleConnectionMetadata(client)).slice().sort(byKey);

  if (canonical(desired, COMPARED) === canonical(live, COMPARED)) {
    return { name: "role-connections", changed: false };
  }

  await putRoleConnectionMetadata(client, desired);

  return {
    name: "role-connections",
    changed: true,
    detail: `registered ${desired.length} metadata record(s)`,
  };
};
