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

import * as Sentry from "@sentry/node";
import { TRPCError } from "@trpc/server";
import { and, eq, getTableColumns, gt, like, sql } from "@virtbase/db";
import { proxmoxIsoDownloads as pids, proxmoxNodes } from "@virtbase/db/schema";
import { buildOrderBy, createId } from "@virtbase/db/utils";
import {
  ISO_DOWNLOAD_EXPIRATION_MINUTES,
  MAX_ACTIVE_ISO_DOWNLOADS_PER_USER,
  MAX_ISO_DOWNLOAD_SIZE_BYTES,
} from "@virtbase/utils";
import {
  GetProxmoxIsoDownloadInputSchema,
  GetProxmoxIsoDownloadOutputSchema,
  getPaginationMeta,
  ListProxmoxIsoDownloadsInputSchema,
  ListProxmoxIsoDownloadsOutputSchema,
  UploadProxmoxIsoInputSchema,
  UploadProxmoxIsoOutputSchema,
} from "@virtbase/validators";
import { getProxmoxInstance } from "../../proxmox";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { isoStatusRouter } from "./status";

export const isoRouter = createTRPCRouter({
  status: isoStatusRouter,
  get: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/iso/{id}",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["ISO"],
        summary: "Get an ISO image",
        description: "Returns a specific ISO image by its unique identifier.",
      },
      permissions: {
        iso: ["read"],
      },
    })
    .input(GetProxmoxIsoDownloadInputSchema)
    .output(GetProxmoxIsoDownloadOutputSchema)
    .query(async ({ ctx, input }) => {
      const { db, userId } = ctx;

      const {
        id,
        name,
        url,
        expiresAt: expires_at,
        finishedAt: finished_at,
        failedAt: failed_at,
        createdAt: created_at,
        updatedAt: updated_at,
      } = await db.transaction(
        async (tx) => {
          const {
            userId: _,
            proxmoxNodeId: __,
            upid: ____,
            ...columns
          } = getTableColumns(pids);
          const result = await tx
            .select(columns)
            .from(pids)
            .where(
              and(
                eq(pids.id, input.id),
                // [!] Authorization: Only allow the user to access their own ISO image downloads
                eq(pids.userId, userId),
                // Only show ISO images that have not expired yet
                gt(pids.expiresAt, sql`now()`),
              ),
            )
            .limit(1)
            .then(([row]) => row);

          if (!result) {
            throw new TRPCError({
              code: "NOT_FOUND",
            });
          }

          return result;
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );

      return {
        iso_download: {
          id,
          name,
          url,
          expires_at,
          finished_at,
          failed_at,
          created_at,
          updated_at,
        },
      };
    }),
  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/iso",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["ISO"],
        summary: "List ISO images",
        description: "Returns a list of ISO images.",
      },
      permissions: {
        iso: ["read"],
      },
    })
    .input(ListProxmoxIsoDownloadsInputSchema)
    .output(ListProxmoxIsoDownloadsOutputSchema)
    .query(async ({ ctx, input }) => {
      const { db, userId } = ctx;

      const { page, per_page: perPage } = input;

      const where = and(
        // [!] Authorization: Only allow the user to access their own ISO image downloads
        eq(pids.userId, userId),
        // Only show ISO images that have not expired yet
        gt(pids.expiresAt, sql`now()`),
        // Filters
        input.url ? eq(pids.url, input.url) : undefined,
        input.name ? like(pids.name, `%${input.name}%`) : undefined,
      );

      const orderBy = buildOrderBy(pids, input.sort, pids.id);

      const offset = (page - 1) * perPage;

      const { data, total } = await db.transaction(
        async (tx) => {
          const data = await tx
            .select({
              id: pids.id,
              name: pids.name,
              url: pids.url,
              expires_at: pids.expiresAt,
              failed_at: pids.failedAt,
              finished_at: pids.finishedAt,
            })
            .from(pids)
            .limit(perPage)
            .offset(offset)
            .where(where)
            .orderBy(...orderBy);

          const total = await tx.$count(pids, where);

          return { data, total };
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );

      return {
        iso_downloads: data.map((item) => ({
          id: item.id,
          name: item.name,
          url: item.url,
          expires_at: item.expires_at,
          failed_at: item.failed_at,
          finished_at: item.finished_at,
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
  upload: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/iso/upload",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["ISO"],
        summary: "Upload an ISO image",
      },
      ratelimit: {
        requests: 10,
        seconds: "1 h",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `upload-iso:${userId || defaultFingerprint}`,
      },
      permissions: {
        iso: ["write"],
      },
    })
    .input(UploadProxmoxIsoInputSchema)
    .output(UploadProxmoxIsoOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = ctx;
      const { url, name } = input;

      const { id, created_at, updated_at, expires_at, finished_at, failed_at } =
        await db.transaction(
          async (tx) => {
            const activeCount = await tx.$count(
              pids,
              and(
                // [!] Authorization: Only allow the user to access their own ISO image downloads
                eq(pids.userId, userId),
                // Proxmox ISO image has not expired yet
                gt(pids.expiresAt, sql`now()`),
              ),
            );

            if (activeCount >= MAX_ACTIVE_ISO_DOWNLOADS_PER_USER) {
              throw new TRPCError({
                code: "BAD_REQUEST",
              });
            }

            const fileSizeBytes = await getFileDownloadSizeBytes(url);
            if (!fileSizeBytes || fileSizeBytes > MAX_ISO_DOWNLOAD_SIZE_BYTES) {
              throw new TRPCError({
                code: "BAD_REQUEST",
              });
            }

            // TODO: Get correct storage node;
            // this only works if isoDownloadStorage is same across all nodes
            const proxmoxNode = await tx
              .select({
                id: proxmoxNodes.id,
                hostname: proxmoxNodes.hostname,
                fqdn: proxmoxNodes.fqdn,
                tokenID: proxmoxNodes.tokenID,
                tokenSecret: proxmoxNodes.tokenSecret,
                isoDownloadStorage: proxmoxNodes.isoDownloadStorage,
              })
              .from(proxmoxNodes)
              .limit(1)
              .then(([row]) => row);

            if (!proxmoxNode) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
              });
            }

            const instance = getProxmoxInstance(proxmoxNode);
            const fileId = createId({ prefix: "iso_" });

            const upid = await instance.node.storage
              .$(proxmoxNode.isoDownloadStorage)
              ["download-url"].$post({
                content: "iso",
                filename: `${fileId}.iso`,
                url,
              });

            const result = await tx
              .insert(pids)
              .values({
                id: fileId,
                userId,
                name,
                url,
                upid,
                proxmoxNodeId: proxmoxNode.id,
                expiresAt: sql`now() + INTERVAL '${sql.raw(`${ISO_DOWNLOAD_EXPIRATION_MINUTES}`)} minutes'`,
              })
              .returning({
                id: pids.id,
                name: pids.name,
                expires_at: pids.expiresAt,
                finished_at: pids.finishedAt,
                failed_at: pids.failedAt,
                created_at: pids.createdAt,
                updated_at: pids.updatedAt,
              })
              .then(([row]) => row);

            if (!result) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
              });
            }

            return result;
          },
          {
            accessMode: "read write",
            isolationLevel: "serializable",
          },
        );

      return {
        iso_download: {
          id,
          name,
          url,
          created_at,
          updated_at,
          expires_at,
          finished_at,
          failed_at,
        },
      };
    }),
});

const getFileDownloadSizeBytes = async (url: string): Promise<number | 0> => {
  try {
    const response = await fetch(url, {
      method: "HEAD",
    });

    if (!response.ok) {
      return 0;
    }

    const contentLength = response.headers.get("content-length");
    if (!contentLength) {
      return 0;
    }

    return parseInt(contentLength, 10);
  } catch (error) {
    Sentry.captureException(error);

    return 0;
  }
};
