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
import { ProxmoxTemplateSchema } from "./proxmox-template";
import { ServerSchema } from "./server";
import { ServerPlanSchema } from "./server-plan";
import { SSHKeySchema } from "./ssh-keys";

const orderType = z.enum(["new_server", "extend_server", "upgrade_server"]);

const BaseOrderServerPlanInputSchema = z.object({
  /** Legal requirements */
  waiver: z.boolean().refine((value) => value === true),
  terms: z.boolean().refine((value) => value === true),
});

export const OrderNewServerPlanInputSchema =
  BaseOrderServerPlanInputSchema.extend({
    type: z.literal("new_server"),
    server_plan_id: ServerPlanSchema.shape.id,
    // TODO: Make nullish
    template_id: ProxmoxTemplateSchema.shape.id,
    ssh_key_id: SSHKeySchema.shape.id.nullish(),
    new_ssh_key: SSHKeySchema.shape.public_key.nullish(),
    root_password: z
      .string()
      .min(8)
      .regex(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/)
      .nullish(),
  });

export type OrderNewServerPlanInput = z.infer<
  typeof OrderNewServerPlanInputSchema
>;

export const OrderExtendServerPlanInputSchema =
  BaseOrderServerPlanInputSchema.extend({
    type: z.literal("extend_server"),
    server_plan_id: ServerPlanSchema.shape.id,
    server_id: ServerSchema.shape.id,
  });

export const OrderUpgradeServerPlanInputSchema =
  BaseOrderServerPlanInputSchema.extend({
    type: z.literal("upgrade_server"),
    server_plan_id: ServerPlanSchema.shape.id,
    server_id: ServerSchema.shape.id,
  });

export const OrderServerPlanInputSchema = z.discriminatedUnion("type", [
  OrderNewServerPlanInputSchema,
  OrderExtendServerPlanInputSchema,
  OrderUpgradeServerPlanInputSchema,
]);

export type OrderServerPlanInput = z.infer<typeof OrderServerPlanInputSchema>;

export const ExtendOrUpgradeServerPlanInputSchema = z.discriminatedUnion(
  "type",
  [OrderExtendServerPlanInputSchema, OrderUpgradeServerPlanInputSchema],
);

export type ExtendOrUpgradeServerPlanInput = z.infer<
  typeof ExtendOrUpgradeServerPlanInputSchema
>;

export const OrderServerPlanOutputSchema = z.object({
  payment_intent_id: z.string(),
  client_secret: z.string().nullable(),
  customer_session_client_secret: z.string(),
});

const ConfigurationSnapshotBaseSchema = z.object({
  version: z.number().positive(),
  type: orderType,
});

export type ConfigurationSnapshotBase = z.infer<
  typeof ConfigurationSnapshotBaseSchema
>;

export const OrderNewServerPlanConfigurationSnapshotSchema =
  ConfigurationSnapshotBaseSchema.extend({
    version: z.literal(1),
    type: z.literal("new_server"),
    server_plan_id: OrderNewServerPlanInputSchema.shape.server_plan_id,
    template_id: OrderNewServerPlanInputSchema.shape.template_id,
    ssh_key_id: OrderNewServerPlanInputSchema.shape.ssh_key_id,
    root_password: z.string().nullish(),
  });

export type OrderNewServerPlanConfigurationSnapshot = z.infer<
  typeof OrderNewServerPlanConfigurationSnapshotSchema
>;

export const OrderExtendServerPlanConfigurationSnapshotSchema =
  ConfigurationSnapshotBaseSchema.extend({
    version: z.literal(1),
    type: z.literal("extend_server"),
    server_id: ServerSchema.shape.id,
    server_plan_id: ServerPlanSchema.shape.id,
  });

export type OrderExtendServerPlanConfigurationSnapshot = z.infer<
  typeof OrderExtendServerPlanConfigurationSnapshotSchema
>;

export const UpgradeServerPlanConfigurationSnapshotSchema =
  ConfigurationSnapshotBaseSchema.extend({
    version: z.literal(1),
    type: z.literal("upgrade_server"),
    server_id: ServerSchema.shape.id,
    server_plan_id: OrderUpgradeServerPlanInputSchema.shape.server_plan_id,
  });

export type UpgradeServerPlanConfigurationSnapshot = z.infer<
  typeof UpgradeServerPlanConfigurationSnapshotSchema
>;

export type OrderConfigurationSnapshot =
  | OrderNewServerPlanConfigurationSnapshot
  | OrderExtendServerPlanConfigurationSnapshot
  | UpgradeServerPlanConfigurationSnapshot;

export const CustomCheckoutInputSchema = z.object({
  payment_intent_id: z.string().min(1),
  type: z.enum(["anonpay"]),
  billing_details: z.object({
    name: z.string().nullable(),
    address: z.object({
      line1: z.string().nullable(),
      line2: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      postal_code: z.string().nullable(),
      country: z.string().nullable(),
    }),
  }),
});

export type CustomCheckoutInput = z.infer<typeof CustomCheckoutInputSchema>;

export const CustomCheckoutOutputSchema = z.object({
  redirect_url: z.url(),
});

export type CustomCheckoutOutput = z.infer<typeof CustomCheckoutOutputSchema>;
