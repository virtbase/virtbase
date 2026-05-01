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

import * as z from "zod";

export const API_KEY_PERMISSIONS = {
  servers: ["read", "write"],
  backups: ["read", "write"],
  firewall: ["read", "write"],
  console: ["read"],
  rdns: ["read", "write"],
  ssh_keys: ["read", "write"],
  invoices: ["read"],
  iso: ["read", "write"],
};

export type APIKeyPermissions = typeof API_KEY_PERMISSIONS;

export const APIKeyPermissionsSchema = z.object({
  servers: z.array(z.enum(["read", "write"])).default([]),
  backups: z.array(z.enum(["read", "write"])).default([]),
  firewall: z.array(z.enum(["read", "write"])).default([]),
  console: z.array(z.enum(["read"])).default([]),
  rdns: z.array(z.enum(["read", "write"])).default([]),
  ssh_keys: z.array(z.enum(["read", "write"])).default([]),
  invoices: z.array(z.enum(["read"])).default([]),
  iso: z.array(z.enum(["read", "write"])).default([]),
});

export const CreateAPIKeyInputSchema = z.object({
  name: z.string().min(1).max(64),
  permissions: APIKeyPermissionsSchema.partial(),
});

export type CreateAPIKeyInput = z.infer<typeof CreateAPIKeyInputSchema>;
