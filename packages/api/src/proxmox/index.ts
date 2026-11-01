/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

export type { Proxmox } from "@virtbase/proxmox-api";
export * from "./agent/index.ts";
export * from "./change-adapter-netrate.ts";
export * from "./create-ha-rule.ts";
export * from "./find-follow-up-guest-power-task.ts";
export * from "./generate-cloud-init-network-config.ts";
export * from "./get-last-task.ts";
export * from "./get-network-adapter-config.ts";
export * from "./get-proxmox-instance.ts";
export * from "./perform-power-action.ts";
