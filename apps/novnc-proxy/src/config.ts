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

/**
 * Configuration, read once from the environment at startup.
 *
 * A proxy without a usable `NOVNC_PROXY_SECRET` refuses every console, so it
 * refuses to start instead: a crash loop is noticed at deploy time, a proxy
 * that turns every console away is noticed by a customer.
 */

/** On its own because the healthcheck needs the port and not the secret. */
export const PortSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(65_535)
  .default(8443);

export const ConfigSchema = z
  .object({
    NOVNC_PROXY_SECRET: z
      .string({
        error:
          "NOVNC_PROXY_SECRET is not set; it must match NOVNC_PROXY_SECRET in the web app",
      })
      .regex(
        /^[0-9a-f]{64}$/i,
        "NOVNC_PROXY_SECRET must be 64 hex characters (a 256-bit key); generate one with `openssl rand -hex 32`",
      ),
    PORT: PortSchema,
  })
  .transform(({ NOVNC_PROXY_SECRET, PORT }) => ({
    secret: NOVNC_PROXY_SECRET,
    port: PORT,
  }));

export type Config = z.infer<typeof ConfigSchema>;
