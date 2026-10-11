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

import { defineIntegration } from "@virtbase/integration-sdk";
import { LexwareInvoiceProvider } from "./adapter";
import { LexwareClient } from "./client";
import { COUNTRY_CONTACTS, HOME_COUNTRY } from "./constants";
import { localizeLexware } from "./localize";
import { manifest } from "./manifest";

/** Lexware's runtime (ADR 0003); its static half is `./manifest`. */
export default defineIntegration(manifest, {
  provides: {
    invoice: (ctx) =>
      new LexwareInvoiceProvider(
        new LexwareClient({ apiKey: ctx.secrets.apiKey, http: ctx.http }),
      ),
  },
  health: {
    check: async (ctx) => {
      // A read that needs the key and the collective contact every
      // home-country invoice is billed against; a GET, so it changes nothing.
      await new LexwareClient({
        apiKey: ctx.secrets.apiKey,
        http: ctx.http,
      }).retrieveContact(COUNTRY_CONTACTS[HOME_COUNTRY]);
      return { status: "ok", checkedAt: new Date() };
    },
  },
  localize: localizeLexware,
});
