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

/**
 * Whether `vercelEnv`, the value of `NEXT_PUBLIC_VERCEL_ENV`, names the
 * production deployment rather than a preview or a local one.
 *
 * Callers pass `process.env.NEXT_PUBLIC_VERCEL_ENV` written out literally, as
 * the domain constants in `constants/main.ts` read it: Next.js inlines a
 * `NEXT_PUBLIC_` variable only where its full name appears in the source.
 * `NODE_ENV` cannot decide this, because `next build` sets it to `production`
 * for preview deployments too.
 */
export const isProductionDeployment = (
  vercelEnv: string | undefined,
): boolean => vercelEnv === "production";
