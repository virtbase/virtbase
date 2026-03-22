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

import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { authEnv } from "@virtbase/auth/env";
import * as z from "zod";
import z4 from "zod/v4";

export const env = createEnv({
  extends: [authEnv(), vercel()],
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  server: {
    UPSTASH_REDIS_REST_URL: z4.string().min(1),
    UPSTASH_REDIS_REST_TOKEN: z4.string().min(1),
    RESEND_API_KEY: z4.string().optional(),
    SMTP_HOST: z4.string().optional(),
    SMTP_PORT: z4.string().optional(),
    SMTP_USER: z4.string().optional(),
    SMTP_PASSWORD: z4.string().optional(),
    // Sentry Configuration
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    SENTRY_URL: z.url().optional(),
    // Stripe
    STRIPE_SECRET_KEY: z4.string().min(1),
    STRIPE_WEBHOOK_SECRET: z4.string().min(1),
    CRON_SECRET: z4.string().min(1),
  },
  client: {
    // Sentry Configuration
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z4.string().min(1),
  },
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
  skipValidation:
    !!process.env.CI || process.env.npm_lifecycle_event === "lint",
});
