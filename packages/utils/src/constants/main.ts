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

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Virtbase";

export const PUBLIC_DOMAIN =
  process.env.NEXT_PUBLIC_VERCEL_ENV === "production"
    ? `https://${process.env.NEXT_PUBLIC_APP_DOMAIN}`
    : process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"
      ? `https://staging.${process.env.NEXT_PUBLIC_APP_DOMAIN}`
      : "http://virtbase.localhost:3000";

export const PUBLIC_HOSTNAMES = new Set([
  process.env.NEXT_PUBLIC_APP_DOMAIN,
  `staging.${process.env.NEXT_PUBLIC_APP_DOMAIN}`,
  "virtbase.localhost:8888",
  "virtbase.localhost",
]);

export const APP_HOSTNAMES = new Set([
  `app.${process.env.NEXT_PUBLIC_APP_DOMAIN}`,
  `staging.app.${process.env.NEXT_PUBLIC_APP_DOMAIN}`,
  "app.virtbase.localhost:3000",
  "app.virtbase.localhost",
]);

export const APP_DOMAIN =
  process.env.NEXT_PUBLIC_VERCEL_ENV === "production"
    ? `https://app.${process.env.NEXT_PUBLIC_APP_DOMAIN}`
    : process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"
      ? `https://staging.app.${process.env.NEXT_PUBLIC_APP_DOMAIN}`
      : "http://app.virtbase.localhost:3000";

export const ADMIN_HOSTNAMES = new Set([
  `admin.${process.env.NEXT_PUBLIC_APP_DOMAIN}`,
  `staging.admin.${process.env.NEXT_PUBLIC_APP_DOMAIN}`,
  "admin.virtbase.localhost:3000",
  "admin.virtbase.localhost",
]);

export const ADMIN_DOMAIN =
  process.env.NEXT_PUBLIC_VERCEL_ENV === "production"
    ? `https://admin.${process.env.NEXT_PUBLIC_APP_DOMAIN}`
    : process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"
      ? `https://staging.admin.${process.env.NEXT_PUBLIC_APP_DOMAIN}`
      : "http://admin.virtbase.localhost:3000";

export const API_HOSTNAMES = new Set([
  `api.${process.env.NEXT_PUBLIC_APP_DOMAIN}`,
  `staging.api.${process.env.NEXT_PUBLIC_APP_DOMAIN}`,
  "api.virtbase.localhost:3000",
  "api.virtbase.localhost",
]);

export const API_DOMAIN =
  process.env.NEXT_PUBLIC_VERCEL_ENV === "production"
    ? `https://api.${process.env.NEXT_PUBLIC_APP_DOMAIN}`
    : process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"
      ? `https://staging.api.${process.env.NEXT_PUBLIC_APP_DOMAIN}`
      : "http://api.virtbase.localhost:3000";
