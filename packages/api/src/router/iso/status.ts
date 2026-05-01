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
import { createTRPCRouter, protectedProcedure } from "../../trpc";

export const isoStatusRouter = createTRPCRouter({
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

            const log = await instance.node.tasks.$(upid).log.$get({
              download: false,
            });

            // Go through log lines in reverse order
            let percentage: number | null = null;
            for (let i = log.length - 1; i >= 0; i--) {
              const entry = log[i];
              if (!entry) continue;

              // Example lines:
              // 622592K ........ ........ ........ ........ 84%  352M 0s
              // 655360K ........ ........ ........ ........ 89%  342M 0s
              // 688128K ........ ........ ........ ........ 93%  345M 0s
              // 720896K ........ ........ ........ ........ 97%  335M 0s
              // 753664K ........ ........ ..               100%  339M=2.6s
              const match = entry.t.match(/(\d+)%/);
              if (match?.[1]) {
                percentage = parseInt(match[1], 10);
                break;
              }
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
});
