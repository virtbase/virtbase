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

import type { SortableColumns } from "@virtbase/db/utils";
import * as z from "zod";
import { PaginationSchema } from "./pagination";
import { ObjectTimestampSchema } from "./timestamps";
import { preprocessQueryArray } from "./utils";

const MD5_FINGERPRINT_REGEX = /^[a-f0-9]{2}(:[a-f0-9]{2}){15}$/;

/**
 * @see https://github.com/nemchik/ssh-key-regex
 */
const PUBLIC_KEY_REGEX =
  /^(ssh-dss AAAAB3NzaC1kc3|ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNT|ecdsa-sha2-nistp384 AAAAE2VjZHNhLXNoYTItbmlzdHAzOD|ecdsa-sha2-nistp521 AAAAE2VjZHNhLXNoYTItbmlzdHA1Mj|sk-ecdsa-sha2-nistp256@openssh.com AAAAInNrLWVjZHNhLXNoYTItbmlzdHAyNTZAb3BlbnNzaC5jb2|ssh-ed25519 AAAAC3NzaC1lZDI1NTE5|sk-ssh-ed25519@openssh.com AAAAGnNrLXNzaC1lZDI1NTE5QG9wZW5zc2guY29t|ssh-rsa AAAAB3NzaC1yc2)[0-9A-Za-z+/]+[=]{0,3}(\s.*)?$/;

const SSHKeySchema = z.object({
  id: z
    .string()
    .regex(/^sshkey_[A-Z0-9]{25}$/)
    .meta({
      description: "Unique identifier of the SSH key.",
      examples: ["sshkey_1KDR24RNF2WY69G0FG7YHDQ6T"],
    }),
  // user id placeholder
  name: z
    .string()
    .min(1)
    .max(64)
    .meta({
      description: "User-defined display name of the SSH key.",
      examples: ["My SSH Key"],
    }),
  fingerprint: z
    .string()
    .regex(MD5_FINGERPRINT_REGEX)
    .meta({
      description: "MD5 fingerprint of the SSH public key.",
      examples: ["b7:3c:10:9f:40:1f:5b:73:2a:a8:31:3a:12:90:2a:52"],
    }),
  public_key: z
    .string()
    .regex(PUBLIC_KEY_REGEX)
    .meta({
      description:
        "SSH public key in the OpenSSH format ([RFC 4253](https://datatracker.ietf.org/doc/html/rfc4253)).",
      examples: ["ssh-rsa AAAAB3NzaC1yc2..."],
    }),
  created_at: ObjectTimestampSchema.shape.created_at,
  updated_at: ObjectTimestampSchema.shape.updated_at,
});

export type SSHKey = z.infer<typeof SSHKeySchema>;

export const GetSSHKeyInputSchema = z.object({ id: SSHKeySchema.shape.id });

export const GetSSHKeyOutputSchema = z.object({
  ssh_key: SSHKeySchema.pick({
    id: true,
    name: true,
    fingerprint: true,
    public_key: true,
    created_at: true,
    updated_at: true,
  }),
});

const sortSchema = z
  .enum<SortableColumns<SSHKey>>([
    "id",
    "id:asc",
    "id:desc",
    "name",
    "name:asc",
    "name:desc",
  ])
  .array()
  .default(["id:asc"]);

export const ListSSHKeysInputSchema = z.object({
  // Required for trpc-to-openapi to work correctly
  sort: z.preprocess(
    preprocessQueryArray,
    sortSchema,
  ) as unknown as typeof sortSchema,
  name: SSHKeySchema.shape.name.optional(),
  fingerprint: SSHKeySchema.shape.fingerprint.optional(),
  page: PaginationSchema.shape.page,
  per_page: PaginationSchema.shape.per_page,
});

export const ListSSHKeysOutputSchema = z.object({
  ssh_keys: z.array(
    SSHKeySchema.pick({
      id: true,
      name: true,
      fingerprint: true,
      public_key: true,
      created_at: true,
      updated_at: true,
    }),
  ),
  meta: z.object({
    pagination: PaginationSchema,
  }),
});

export const CreateSSHKeyInputSchema = z.object({
  name: SSHKeySchema.shape.name,
  public_key: SSHKeySchema.shape.public_key,
});

export const CreateSSHKeyOutputSchema = GetSSHKeyOutputSchema;

export const UpdateSSHKeyInputSchema = z.object({
  id: SSHKeySchema.shape.id,
  name: SSHKeySchema.shape.name,
});

export const UpdateSSHKeyOutputSchema = GetSSHKeyOutputSchema;

export const DeleteSSHKeyInputSchema = GetSSHKeyInputSchema;

export const DeleteSSHKeyOutputSchema = z.void();
