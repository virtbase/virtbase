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
import { ProxmoxTemplateSchema } from "../proxmox-template";
import { ServerSchema } from "./shared";

const RootPasswordSchema = z
  .string()
  .min(8)
  .max(1000)
  .regex(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/)
  .meta({
    description: "The new root password for the server.",
  });

export const ChangeTemplateServerInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  template_id: ProxmoxTemplateSchema.shape.id,
  root_password: RootPasswordSchema,
});

export type ChangeTemplateServerInput = z.infer<
  typeof ChangeTemplateServerInputSchema
>;

export const ChangeTemplateServerOutputSchema = z.void();

export type ChangeTemplateServerOutput = z.infer<
  typeof ChangeTemplateServerOutputSchema
>;

export const ResetServerPasswordServerInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  username: z
    .string()
    .min(1)
    .max(64)
    .default("root")
    .describe("The username to reset the password for."),
  password: RootPasswordSchema.describe(
    "The new password for the user defined in `username`.",
  ),
});

export type ResetServerPasswordServerInput = z.infer<
  typeof ResetServerPasswordServerInputSchema
>;

export const ResetServerPasswordServerOutputSchema = z.void();

export type ResetServerPasswordServerOutput = z.infer<
  typeof ResetServerPasswordServerOutputSchema
>;
