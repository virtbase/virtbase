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
import { ServerSchema } from "./shared";

export const GetServerFirewallOptionsInputSchema = z.object({
  server_id: ServerSchema.shape.id,
});

export const GetServerFirewallOptionsOutputSchema = z.object({
  options: z.object({
    enabled: z.boolean(),
    //dhcp: z.union([z.literal(0), z.literal(1)]).optional(),
    //ipfilter: z.union([z.literal(0), z.literal(1)]).optional(),
    //log_level_in: z.string().optional(),
    //log_level_out: z.string().optional(),
    //macfilter: z.union([z.literal(0), z.literal(1)]).optional(),
    //ndp: z.union([z.literal(0), z.literal(1)]).optional(),
    policy_in: z.string().optional(),
    policy_out: z.string().optional(),
    //radv: z.union([z.literal(0), z.literal(1)]).optional(),
    digest: z.string().optional(),
  }),
});

export const UpdateServerFirewallOptionsInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  policy_in: z.enum(["ACCEPT", "DROP", "REJECT"]).optional(),
  policy_out: z.enum(["ACCEPT", "DROP", "REJECT"]).optional(),
});

export const UpdateServerFirewallOptionsOutputSchema = z.void();
