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

import { dispatchAccountLinked } from "@virtbase/api/integrations";
import { initAuth } from "@virtbase/auth";
import { nextCookies } from "better-auth/next-js";
import { localeCookiePlugin } from "./locale-cookie";

export const auth = initAuth({
  // `nextCookies()` copies accumulated `set-cookie` headers onto the Next.js
  // response, so it has to stay last: anything that sets a cookie of its own
  // belongs above it.
  additionalPlugins: [localeCookiePlugin, nextCookies()],
  // Fans social logins out to integrations implementing the `identity` port.
  onAccountLinked: dispatchAccountLinked,
});
