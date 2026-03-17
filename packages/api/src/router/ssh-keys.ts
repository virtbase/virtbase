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

import { TRPCError } from "@trpc/server";
import { and, count, eq } from "@virtbase/db";
import { sshKeys } from "@virtbase/db/schema";
import { buildOrderBy } from "@virtbase/db/utils";
import type { ParsedPublicKey } from "@virtbase/utils";
import {
  DEFAULT_PAGE,
  DEFAULT_PER_PAGE,
  parsePublicKey,
} from "@virtbase/utils";
import {
  CreateSSHKeyInputSchema,
  CreateSSHKeyOutputSchema,
  DeleteSSHKeyInputSchema,
  DeleteSSHKeyOutputSchema,
  GetSSHKeyInputSchema,
  GetSSHKeyOutputSchema,
  getPaginationMeta,
  ListSSHKeysInputSchema,
  ListSSHKeysOutputSchema,
  UpdateSSHKeyInputSchema,
  UpdateSSHKeyOutputSchema,
} from "@virtbase/validators";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const sshKeysRouter = createTRPCRouter({
  get: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/ssh_keys/{id}",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["SSH Keys"],
        summary: "Get an SSH key",
        description: "Returns a specific SSH key by its unique identifier.",
      },
    })
    .input(GetSSHKeyInputSchema)
    .output(GetSSHKeyOutputSchema)
    .query(async ({ ctx, input }) => {
      const { db, userId } = ctx;

      const sshKey = await db.transaction(
        async (tx) => {
          return tx
            .select({
              id: sshKeys.id,
              name: sshKeys.name,
              fingerprint: sshKeys.fingerprint,
              public_key: sshKeys.publicKey,
              created_at: sshKeys.createdAt,
              updated_at: sshKeys.updatedAt,
            })
            .from(sshKeys)
            .where(
              and(
                eq(sshKeys.id, input.id),
                // [!] Authorization: Only allow the user to access their own SSH keys
                eq(sshKeys.userId, userId),
              ),
            )
            .limit(1)
            .then(([row]) => row);
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );

      if (!sshKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
        });
      }

      return {
        ssh_key: sshKey,
      };
    }),
  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/ssh_keys",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["SSH Keys"],
        summary: "List SSH keys",
        description: "Returns a list of SSH keys.",
      },
    })
    .input(ListSSHKeysInputSchema)
    .output(ListSSHKeysOutputSchema)
    .query(async ({ ctx, input }) => {
      const { db, userId } = ctx;

      const page = input.page ?? DEFAULT_PAGE;
      const perPage = input.per_page ?? DEFAULT_PER_PAGE;

      const where = and(
        // [!] Authorization: Only allow the user to access their own SSH keys
        eq(sshKeys.userId, userId),
        // Filters
        input.name ? eq(sshKeys.name, input.name) : undefined,
        input.fingerprint
          ? eq(sshKeys.fingerprint, input.fingerprint)
          : undefined,
      );

      const orderBy = buildOrderBy(sshKeys, input.sort, sshKeys.id);

      const offset = (page - 1) * perPage;

      const { data, total } = await db.transaction(
        async (tx) => {
          const data = await tx
            .select({
              id: sshKeys.id,
              name: sshKeys.name,
              fingerprint: sshKeys.fingerprint,
              public_key: sshKeys.publicKey,
              created_at: sshKeys.createdAt,
              updated_at: sshKeys.updatedAt,
            })
            .from(sshKeys)
            .limit(perPage)
            .offset(offset)
            .where(where)
            .orderBy(...orderBy);

          const total = await tx
            .select({ count: count() })
            .from(sshKeys)
            .where(where)
            .execute()
            .then(([res]) => res?.count ?? 0);

          return { data, total };
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );

      return {
        ssh_keys: data.map((item) => ({
          id: item.id,
          name: item.name,
          fingerprint: item.fingerprint,
          public_key: item.public_key,
          created_at: item.created_at,
          updated_at: item.updated_at,
        })),
        meta: {
          pagination: getPaginationMeta({
            total,
            page,
            perPage,
          }),
        },
      };
    }),
  create: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/ssh_keys",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["SSH Keys"],
        summary: "Create an SSH key",
        description:
          "Creates a new SSH key with the given `name` and `public_key`.",
      },
    })
    .input(CreateSSHKeyInputSchema)
    .output(CreateSSHKeyOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = ctx;

      let parsedPublicKey: ParsedPublicKey;
      try {
        parsedPublicKey = await parsePublicKey(input.public_key);
      } catch {
        // Invalid public key format, return a bad request error
        throw new TRPCError({
          code: "BAD_REQUEST",
        });
      }

      const created = await db.transaction(
        async (tx) => {
          return tx
            .insert(sshKeys)
            .values({
              // [!] Authorization: Link the SSH key to the current user
              userId,
              name: input.name,
              publicKey: parsedPublicKey.sanitzedKey,
              fingerprint: parsedPublicKey.fingerprint,
            })
            .returning({
              id: sshKeys.id,
              name: sshKeys.name,
              fingerprint: sshKeys.fingerprint,
              public_key: sshKeys.publicKey,
              created_at: sshKeys.createdAt,
              updated_at: sshKeys.updatedAt,
            })
            .execute()
            .then(([row]) => row);
        },
        {
          accessMode: "read write",
          isolationLevel: "read committed",
        },
      );

      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      return {
        ssh_key: created,
      };
    }),
  update: protectedProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/ssh_keys/{id}",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["SSH Keys"],
        summary: "Update an SSH key",
        description: "Updates an existing SSH key.",
      },
    })
    .input(UpdateSSHKeyInputSchema)
    .output(UpdateSSHKeyOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = ctx;

      const updated = await db.transaction(
        async (tx) => {
          return tx
            .update(sshKeys)
            .set({ name: input.name })
            .where(
              and(
                eq(sshKeys.id, input.id),
                // [!] Authorization: Only allow the user to access their own SSH keys
                eq(sshKeys.userId, userId),
              ),
            )
            .returning({
              id: sshKeys.id,
              name: sshKeys.name,
              fingerprint: sshKeys.fingerprint,
              public_key: sshKeys.publicKey,
              created_at: sshKeys.createdAt,
              updated_at: sshKeys.updatedAt,
            })
            .execute()
            .then(([row]) => row);
        },
        {
          accessMode: "read write",
          isolationLevel: "read committed",
        },
      );

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
        });
      }

      return {
        ssh_key: updated,
      };
    }),
  delete: protectedProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/ssh_keys/{id}",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["SSH Keys"],
        summary: "Delete an SSH key",
        description: "Deletes a specific SSH key by its unique identifier.",
      },
    })
    .input(DeleteSSHKeyInputSchema)
    .output(DeleteSSHKeyOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = ctx;

      const deleted = await db.transaction(
        async (tx) => {
          return tx
            .delete(sshKeys)
            .where(
              and(
                eq(sshKeys.id, input.id),
                // [!] Authorization: Only allow the user to access their own SSH keys
                eq(sshKeys.userId, userId),
              ),
            )
            .returning({
              id: sshKeys.id,
            })
            .then(([row]) => row);
        },
        {
          accessMode: "read write",
          isolationLevel: "read committed",
        },
      );

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
        });
      }

      // Return nothing on success (void)
      return;
    }),
});
