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
 * Whether `env` describes the production deployment, as opposed to a preview or
 * a local one.
 *
 * Decided by `NEXT_PUBLIC_VERCEL_ENV`, the switch the domain constants in
 * `constants/main.ts` already use. `NODE_ENV` cannot decide it: `next build`
 * sets it to `production` for preview deployments too.
 */
export const isProductionDeployment = (
  env: Record<string, string | undefined>,
): boolean => env.NEXT_PUBLIC_VERCEL_ENV === "production";
