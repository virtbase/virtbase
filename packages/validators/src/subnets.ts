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
import { ObjectTimestampSchema } from "./timestamps";

const subnetIdSchema = z.string().regex(/^ipsub_[A-Z0-9]{25}$/);

export const SubnetSchema = z.object({
  id: subnetIdSchema.meta({
    description: "Unique identifier of the subnet.",
    examples: ["ipsub_1KDR24RNF2WY69G0FG7YHDQ6T"],
  }),
  parent_id: subnetIdSchema.nullable().meta({
    description: "Unique identifier of the parent subnet.",
    examples: [null],
  }),
  cidr: z.union([z.cidrv4(), z.cidrv6()]).meta({
    description: "The network specification of the subnet in CIDR notation.",
    examples: ["192.168.1.0/24", "2001:db8::/32"],
  }),
  gateway: z.union([z.ipv4(), z.ipv6()]).meta({
    description: "The gateway IP address of the subnet.",
    examples: ["192.168.1.1", "2001:db8::1"],
  }),
  vlan: z
    .number()
    .int()
    .default(0)
    .meta({
      description: "The VLAN ID of the subnet.",
      examples: [100],
    }),
  dns_reverse_zone: z
    .string()
    .max(255)
    .nullable()
    .meta({
      description: "The DNS reverse zone of the subnet.",
      examples: ["10.10.10.in-addr.arpa"],
    }),
  created_at: ObjectTimestampSchema.shape.created_at,
  updated_at: ObjectTimestampSchema.shape.updated_at,
});

export type Subnet = z.infer<typeof SubnetSchema>;
