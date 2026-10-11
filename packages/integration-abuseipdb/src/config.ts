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
import type * as z from "zod";
import type { secretsSchema, settingsSchema } from "./manifest";

/** The parsed settings of an AbuseIPDB installation ({@link settingsSchema}). */
export type AbuseIpDbSettings = z.output<typeof settingsSchema>;
/** The parsed secrets of an AbuseIPDB installation ({@link secretsSchema}). */
export type AbuseIpDbSecrets = z.output<typeof secretsSchema>;

/** The context the registry hands this package's factories and hooks. */
export type AbuseIpDbContext = IntegrationContext<
  AbuseIpDbSettings,
  AbuseIpDbSecrets
>;
