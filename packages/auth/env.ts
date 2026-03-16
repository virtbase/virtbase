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

import { createEnv } from "@t3-oss/env-core";
import * as z from "zod";

export function authEnv() {
  return createEnv({
    server: {
      // Required environment variables
      BETTER_AUTH_SECRET: z.string().min(1),
      NODE_ENV: z.enum(["development", "production"]).optional(),

      // Optional OAuth providers
      DISCORD_CLIENT_ID: z.string().min(1).optional(),
      DISCORD_CLIENT_SECRET: z.string().min(1).optional(),
      GITHUB_CLIENT_ID: z.string().min(1).optional(),
      GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
      GOOGLE_CLIENT_ID: z.string().min(1).optional(),
      GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    },
    runtimeEnv: process.env,
    skipValidation:
      !!process.env.CI || process.env.npm_lifecycle_event === "lint",
  });
}
