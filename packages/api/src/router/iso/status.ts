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

import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "@virtbase/db";
import {
  proxmoxIsoDownloads as pids,
  proxmoxNodes as pns,
} from "@virtbase/db/schema";
import {
  GetProxmoxIsoDownloadStatusInputSchema,
  GetProxmoxIsoDownloadStatusOutputSchema,
} from "@virtbase/validators";
import { getProxmoxInstance } from "../../proxmox";
import { protectedProcedure } from "../../trpc";

export const isoStatusRouter = {
  get: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/iso/{id}/status",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["ISO"],
        summary: "Get the status of an ISO download",
        description:
          "Returns the status of a specific ISO download by its unique identifier.",
      },
      permissions: {
        iso: ["read"],
      },
    })
    .input(GetProxmoxIsoDownloadStatusInputSchema)
    .output(GetProxmoxIsoDownloadStatusOutputSchema)
    .query(async ({ ctx, input }) => {
      const { db, userId } = ctx;

      const where = and(
        eq(pids.id, input.id),
        // [!] Authorization: Only allow the user to access their own ISO image downloads
        eq(pids.userId, userId),
      );

      const status = await db.transaction(
        async (tx) => {
          const isoDownload = await tx
            .select({
              id: pids.id,
              upid: pids.upid,
              expiresAt: pids.expiresAt,
              failedAt: pids.failedAt,
              finishedAt: pids.finishedAt,
              proxmoxNode: {
                hostname: pns.hostname,
                fqdn: pns.fqdn,
                // [!] Sensitive data
                tokenID: pns.tokenID,
                tokenSecret: pns.tokenSecret,
              },
            })
            .from(pids)
            .innerJoin(pns, eq(pns.id, pids.proxmoxNodeId))
            .where(where)
            .limit(1)
            .then(([row]) => row);

          if (!isoDownload) {
            throw new TRPCError({
              code: "NOT_FOUND",
            });
          }

          const { proxmoxNode, upid, expiresAt, failedAt, finishedAt } =
            isoDownload;

          if (finishedAt) {
            // ISO download is already finished
            return {
              expires_at: expiresAt,
              finished_at: finishedAt,
              failed_at: failedAt,
              percentage: null,
            };
          }

          const instance = getProxmoxInstance(proxmoxNode);

          const task = await instance.node.tasks.$(upid).status.$get();
          if (task.status === "stopped") {
            const updated = await tx
              .update(pids)
              .set(
                task.exitstatus === "OK"
                  ? // ISO download finished successfully
                    {
                      failedAt: null,
                      finishedAt: sql`now()`,
                    }
                  : // Any other exit status = ISO download failed
                    {
                      finishedAt: sql`now()`,
                      failedAt: sql`now()`,
                    },
              )
              .where(where)
              .returning({
                failedAt: pids.failedAt,
                finishedAt: pids.finishedAt,
              })
              .then(([row]) => row);

            if (!updated) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
              });
            }

            return {
              expires_at: expiresAt,
              finished_at: updated.finishedAt,
              failed_at: updated.failedAt,
              percentage: null,
            };
          }

          if (task.status === "running") {
            // ISO download is still running

            let start = 0;
            const limit = 50;

            let percentage: number | null = null;

            while (percentage === null) {
              const result = await instance.node.tasks.$(upid).log.$get({
                download: false,
                start,
                limit,
              });

              // No more logs available
              if (result.length === 0) {
                break;
              }

              // Search newest -> oldest in this batch
              for (let i = result.length - 1; i >= 0; i--) {
                const text = result[i]?.t;
                if (!text) continue;

                const match = /(\d+)%/.exec(text);
                if (match?.[1]) {
                  percentage = Number(match[1]);
                  break;
                }
              }

              // Last page reached and still nothing found
              if (result.length < limit) {
                break;
              }

              start += result.length;
            }

            return {
              expires_at: expiresAt,
              finished_at: null,
              failed_at: null,
              percentage,
            };
          }

          // Unhandled task status
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
          });
        },
        {
          accessMode: "read write",
          isolationLevel: "read committed",
        },
      );

      return {
        status,
      };
    }),
} satisfies TRPCRouterRecord;
