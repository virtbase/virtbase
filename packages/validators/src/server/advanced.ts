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

export const GetServerAdvancedInputSchema = z.object({
  server_id: ServerSchema.shape.id,
});

export type GetServerAdvancedInput = z.infer<
  typeof GetServerAdvancedInputSchema
>;

export const ServerAdvancedSettingsSchema = z.object({
  tpm: z.enum(["v1.2", "v2.0"]).nullable(),
  bios: z.enum(["legacy", "uefi"]).nullable(),
});

export const GetServerAdvancedOutputSchema = z.object({
  settings: ServerAdvancedSettingsSchema,
});

export type GetServerAdvancedOutput = z.infer<
  typeof GetServerAdvancedOutputSchema
>;

export const UpdateServerAdvancedInputSchema = z
  .object({
    server_id: ServerSchema.shape.id,
  })
  .extend(ServerAdvancedSettingsSchema.partial().shape);

export type UpdateServerAdvancedInput = z.infer<
  typeof UpdateServerAdvancedInputSchema
>;

export const UpdateServerAdvancedOutputSchema = z.void();

export type UpdateServerAdvancedOutput = z.infer<
  typeof UpdateServerAdvancedOutputSchema
>;
