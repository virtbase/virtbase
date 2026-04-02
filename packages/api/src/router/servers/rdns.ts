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
import { and, count, eq, isNull, sql } from "@virtbase/db";
import {
  pointerRecords,
  subnetAllocations,
  subnets,
} from "@virtbase/db/schema";
import { buildOrderBy } from "@virtbase/db/utils";
import { getPaginationMeta } from "@virtbase/validators";
import {
  DeletePointerRecordInputSchema,
  DeletePointerRecordOutputSchema,
  GetPointerRecordInputSchema,
  GetPointerRecordOutputSchema,
  ListPointerRecordsInputSchema,
  ListPointerRecordsOutputSchema,
  UpsertPointerRecordInputSchema,
  UpsertPointerRecordOutputSchema,
} from "@virtbase/validators/server";
import { buildPtrName, powerdns } from "../../powerdns";
import { createTRPCRouter, serverProcedure } from "../../trpc";

export const serversRdnsRouter = createTRPCRouter({
  get: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}/rdns/records/{id}",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["rDNS"],
        summary: "Get a PTR record",
        description: "Returns a specific PTR record by its unique identifier.",
      },
      permissions: {
        rdns: ["read"],
      },
    })
    .input(GetPointerRecordInputSchema)
    .output(GetPointerRecordOutputSchema)
    .query(async ({ ctx, input }) => {
      const { db, server } = ctx;

      const record = await db.transaction(
        async (tx) => {
          return tx
            .select({
              id: pointerRecords.id,
              ip: pointerRecords.ip,
              allocation_id: subnetAllocations.id,
              subnet_id: subnets.id,
              subnet_cidr: subnets.cidr,
              subnet_gateway: subnets.gateway,
              subnet_dns_reverse_zone: subnets.dnsReverseZone,
              hostname: pointerRecords.hostname,
              created_at: pointerRecords.createdAt,
              updated_at: pointerRecords.updatedAt,
            })
            .from(pointerRecords)
            .innerJoin(
              subnetAllocations,
              eq(pointerRecords.subnetAllocationId, subnetAllocations.id),
            )
            .innerJoin(subnets, eq(subnetAllocations.subnetId, subnets.id))
            .where(
              and(
                eq(pointerRecords.id, input.id),
                // [!] Authorization: Only allow the user to access their own rDNS records
                eq(subnetAllocations.serverId, server.id),
                isNull(subnetAllocations.deallocatedAt),
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

      if (!record) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const {
        allocation_id,
        subnet_id,
        subnet_cidr,
        subnet_gateway,
        subnet_dns_reverse_zone,
        ...rest
      } = record;

      return {
        record: {
          ...rest,
          allocation: input.expand.includes("allocation")
            ? {
                id: allocation_id,
                subnet: {
                  id: subnet_id,
                  cidr: subnet_cidr,
                  gateway: subnet_gateway,
                  dns_reverse_zone: subnet_dns_reverse_zone,
                },
              }
            : allocation_id,
        },
      };
    }),
  list: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}/rdns/records",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["rDNS"],
        summary: "List PTR records",
        description: "Returns a list of PTR records for a server.",
      },
      permissions: {
        rdns: ["read"],
      },
    })
    .input(ListPointerRecordsInputSchema)
    .output(ListPointerRecordsOutputSchema)
    .query(async ({ ctx, input }) => {
      const { db, server } = ctx;

      const { page, per_page: perPage } = input;

      const where = and(
        // [!] Authorization: Only allow the user to access their own rDNS records
        eq(subnetAllocations.serverId, server.id),
        isNull(subnetAllocations.deallocatedAt),
        // Filters
        input.hostname
          ? eq(pointerRecords.hostname, input.hostname)
          : undefined,
      );

      const orderBy = buildOrderBy(
        pointerRecords,
        input.sort,
        pointerRecords.id,
      );

      const offset = (page - 1) * perPage;

      const { data, total } = await db.transaction(
        async (tx) => {
          const data = await tx
            .select({
              id: pointerRecords.id,
              ip: pointerRecords.ip,
              hostname: pointerRecords.hostname,
              allocation_id: subnetAllocations.id,
              subnet_id: subnets.id,
              subnet_cidr: subnets.cidr,
              subnet_gateway: subnets.gateway,
              subnet_dns_reverse_zone: subnets.dnsReverseZone,
              created_at: pointerRecords.createdAt,
              updated_at: pointerRecords.updatedAt,
            })
            .from(pointerRecords)
            .innerJoin(
              subnetAllocations,
              eq(pointerRecords.subnetAllocationId, subnetAllocations.id),
            )
            .innerJoin(subnets, eq(subnetAllocations.subnetId, subnets.id))
            .limit(perPage)
            .offset(offset)
            .where(where)
            .orderBy(...orderBy);

          const total = await tx
            .select({ count: count() })
            .from(pointerRecords)
            .innerJoin(
              subnetAllocations,
              eq(pointerRecords.subnetAllocationId, subnetAllocations.id),
            )
            .innerJoin(subnets, eq(subnetAllocations.subnetId, subnets.id))
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
        records: data.map((item) => {
          const {
            allocation_id,
            subnet_id,
            subnet_cidr,
            subnet_gateway,
            subnet_dns_reverse_zone,
            ...rest
          } = item;

          return {
            ...rest,
            allocation: input.expand.includes("allocation")
              ? {
                  id: allocation_id,
                  subnet: {
                    id: subnet_id,
                    cidr: subnet_cidr,
                    gateway: subnet_gateway,
                    dns_reverse_zone: subnet_dns_reverse_zone,
                  },
                }
              : allocation_id,
          };
        }),
        meta: {
          pagination: getPaginationMeta({
            total,
            page,
            perPage,
          }),
        },
      };
    }),
  upsert: serverProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/servers/{server_id}/rdns/records",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["rDNS"],
        summary: "Upsert a PTR record",
        description: "Upserts a PTR record for a given IP and hostname.",
      },
      forbiddenStates: ["terminated", "suspended"],
      permissions: {
        rdns: ["write"],
      },
      ratelimit: {
        requests: 10,
        seconds: "1 h",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `upsert-rdns-record:${userId || defaultFingerprint}`,
      },
    })
    .input(UpsertPointerRecordInputSchema)
    .output(UpsertPointerRecordOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, server } = ctx;

      const record = await db.transaction(
        async (tx) => {
          if (!powerdns) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          }

          // Find the matching (active) allocation for the given IP
          // The IP must be inside the subnet of the allocation
          const allocation = await tx
            .select({
              id: subnetAllocations.id,
              subnet_id: subnets.id,
              subnet_cidr: subnets.cidr,
              subnet_gateway: subnets.gateway,
              subnet_dns_reverse_zone: subnets.dnsReverseZone,
            })
            .from(subnetAllocations)
            .where(
              and(
                // [!] Authorization: Only allow the user to access their own rDNS records
                eq(subnetAllocations.serverId, server.id),
                isNull(subnetAllocations.deallocatedAt),
                // IP is inside the subnet
                sql`${input.ip}::inet <<= ${subnets.cidr}`,
              ),
            )
            .innerJoin(subnets, eq(subnetAllocations.subnetId, subnets.id))
            .limit(1)
            .then(([row]) => row);

          if (!allocation) {
            throw new TRPCError({ code: "BAD_REQUEST" });
          }

          const zoneName = allocation.subnet_dns_reverse_zone;
          if (!zoneName) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          }

          const upserted = await db
            .insert(pointerRecords)
            .values({
              subnetAllocationId: allocation.id,
              ip: input.ip,
              hostname: input.hostname,
            })
            .onConflictDoUpdate({
              target: pointerRecords.ip,
              set: {
                subnetAllocationId: allocation.id,
                hostname: input.hostname,
                updatedAt: sql`now()`,
              },
            })
            .returning({
              id: pointerRecords.id,
              ip: pointerRecords.ip,
              hostname: pointerRecords.hostname,
              created_at: pointerRecords.createdAt,
              updated_at: pointerRecords.updatedAt,
            })
            .then(([row]) => row);

          if (!upserted) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          }

          const { ip, hostname } = upserted;

          await powerdns.upsertReverseDNSRecord({
            zone: zoneName,
            hostname,
            name: buildPtrName(ip, zoneName),
          });

          return upserted;
        },
        {
          accessMode: "read write",
          isolationLevel: "read committed",
        },
      );

      return { record };
    }),
  delete: serverProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/servers/{server_id}/rdns/records/{id}",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["rDNS"],
        summary: "Delete a PTR record",
        description: "Deletes a specific PTR record by its unique identifier.",
      },
      permissions: {
        rdns: ["write"],
      },
    })
    .input(DeletePointerRecordInputSchema)
    .output(DeletePointerRecordOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, server } = ctx;

      await db.transaction(
        async (tx) => {
          if (!powerdns) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          }

          const record = await tx
            .select({
              id: pointerRecords.id,
              ip: pointerRecords.ip,
              subnet_dns_reverse_zone: subnets.dnsReverseZone,
            })
            .from(pointerRecords)
            .innerJoin(
              subnetAllocations,
              eq(pointerRecords.subnetAllocationId, subnetAllocations.id),
            )
            .innerJoin(subnets, eq(subnetAllocations.subnetId, subnets.id))
            .where(
              and(
                eq(pointerRecords.id, input.id),
                // [!] Authorization: Only allow the user to access their own rDNS records
                eq(subnetAllocations.serverId, server.id),
                isNull(subnetAllocations.deallocatedAt),
              ),
            )
            .limit(1)
            .then(([row]) => row);

          if (!record) {
            throw new TRPCError({ code: "NOT_FOUND" });
          }

          const zoneName = record.subnet_dns_reverse_zone;
          if (!zoneName) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          }

          await tx
            .delete(pointerRecords)
            .where(eq(pointerRecords.id, record.id));

          await powerdns.deleteReverseDNSRecord({
            zone: zoneName,
            name: buildPtrName(record.ip, zoneName),
          });
        },
        {
          accessMode: "read write",
          isolationLevel: "read committed",
        },
      );
    }),
});
