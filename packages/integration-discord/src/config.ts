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

import type { IntegrationContext } from "@virtbase/integration-sdk";
import * as z from "zod";

export const settingsSchema = z.object({
  appId: z.string().min(1),
});

export const secretsSchema = z.object({
  botToken: z.string().min(1),
  publicKey: z.string().min(1),
});

/**
 * Lives apart from the integration definition so webhook handlers can be typed
 * against it without importing the definition that mounts them.
 */
export type DiscordContext = IntegrationContext<
  z.output<typeof settingsSchema>,
  z.output<typeof secretsSchema>
>;
