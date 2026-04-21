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
import { ProxmoxTemplateGroupSchema } from "./proxmox-template-group";

export const CreateProxmoxTemplateInputSchema = ProxmoxTemplateSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).extend({
  proxmox_template_group_id: ProxmoxTemplateGroupSchema.shape.id,
});

export type CreateProxmoxTemplateInput = z.infer<
  typeof CreateProxmoxTemplateInputSchema
>;

export const CreateProxmoxTemplateOutputSchema = z.void();

export type CreateProxmoxTemplateOutput = z.infer<
  typeof CreateProxmoxTemplateOutputSchema
>;
