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
import {
  GetServerAdvancedInputSchema,
  GetServerAdvancedOutputSchema,
  UpdateServerAdvancedInputSchema,
  UpdateServerAdvancedOutputSchema,
} from "@virtbase/validators/server";
import { createTRPCRouter, serverProcedure } from "../../trpc";

export const serversAdvancedRouter = createTRPCRouter({
  get: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}/advanced",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Get advanced settings",
        description: "Get the advanced settings for a server.",
      },
      permissions: {
        servers: ["read"],
      },
    })
    .input(GetServerAdvancedInputSchema)
    .output(GetServerAdvancedOutputSchema)
    .query(async ({ ctx }) => {
      const { instance } = ctx;

      try {
        const { bios, tpmstate0 } = await instance.vm.config.$get();

        // Example: version=v1.2
        const tpmversion = tpmstate0?.match(/version=(v\d+\.\d+)/)?.[1] ?? null;

        return {
          settings: {
            tpm: tpmversion as "v1.2" | "v2.0" | null,
            bios: bios !== "ovmf" ? "legacy" : "uefi",
          },
        };
      } catch (error) {
        Sentry.captureException(error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),
  update: serverProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/servers/{server_id}/advanced",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Update advanced settings",
        description: "Update the advanced settings for a server.",
      },
      forbiddenStates: ["suspended", "terminated", "installing"],
      permissions: {
        servers: ["write"],
      },
    })
    .input(UpdateServerAdvancedInputSchema)
    .output(UpdateServerAdvancedOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { instance } = ctx;

      try {
        const config = await instance.vm.config.$get();
        const storage = config.scsi0?.split(":")[0];

        if (!storage) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
          });
        }

        if (input.tpm === null && config.tpmstate0) {
          await instance.vm.config.$put({
            delete: "tpmstate0",
          });
        }

        if (input.tpm === "v1.2" || input.tpm === "v2.0") {
          if (config.tpmstate0) {
            await instance.vm.config.$put({
              delete: "tpmstate0",
            });
          }

          await instance.vm.config.$put({
            tpmstate0: `${storage}:1,version=${input.tpm}`,
          });
        }

        if (input.bios) {
          await instance.vm.config.$put({
            bios: input.bios !== "uefi" ? "seabios" : "ovmf",
          });
        }
      } catch (error) {
        Sentry.captureException(error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),
});
