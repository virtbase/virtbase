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

import { COOKIE_DOMAIN } from "@virtbase/utils";
import { defineRouting } from "next-intl/routing";
import { COOKIE_MAX_AGE, COOKIE_NAME, defaultLocale, locales } from "./config";

/**
 * Routing for the signed-in consoles.
 *
 * `localePrefix: "never"` is the arrangement `next-intl` documents for exactly
 * this shape: the locale stays out of the address bar, but routes still live
 * under a `[locale]` segment internally, so the root layout can read it as a
 * root param and the tree can be prerendered per language.
 *
 * The consoles are behind a login and marked `noindex`, so there is nothing to
 * gain from a locale in the URL - the language belongs to the account, not the
 * address. `next-intl` also disables alternate links in this mode by itself,
 * since the URLs are not unique per locale.
 */
export const consoleRouting = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "never",
  localeCookie: {
    name: COOKIE_NAME,
    domain: COOKIE_DOMAIN,
    maxAge: COOKIE_MAX_AGE,
  },
});
