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

import { ADMIN_DOMAIN, APP_DOMAIN, PUBLIC_DOMAIN } from "@virtbase/utils";

/**
 * Absolute URLs for the three hosts the suite drives.
 *
 * Playwright's `use.baseURL` is a single value, but this app is three sites on
 * three hostnames and `meta.e2e.ts` deliberately asserts against two of them in
 * one test. A single `baseURL` cannot express that, which is why the old
 * `BASE_URL` env var silently did nothing - it set `use.baseURL` while every
 * spec kept calling `page.goto()` with an absolute URL built from the constants.
 *
 * These helpers keep the multi-host coverage and make the origins overridable,
 * so the suite can be pointed at a preview deployment.
 */
const origin = (override: string | undefined, fallback: string) =>
  (override ?? fallback).replace(/\/$/, "");

export const publicOrigin = origin(process.env.E2E_PUBLIC_URL, PUBLIC_DOMAIN);
export const appOrigin = origin(process.env.E2E_APP_URL, APP_DOMAIN);
export const adminOrigin = origin(process.env.E2E_ADMIN_URL, ADMIN_DOMAIN);

export const publicUrl = (path: string) => `${publicOrigin}${path}`;
export const appUrl = (path: string) => `${appOrigin}${path}`;
export const adminUrl = (path: string) => `${adminOrigin}${path}`;
