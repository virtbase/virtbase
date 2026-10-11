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
import { PowerDnsAdapter } from "./adapter";
import { PowerDNSClient } from "./client";
import { localizePowerDns } from "./localize";
import { manifest } from "./manifest";

/** PowerDNS's runtime (ADR 0003); its static half is `./manifest`. */
export default defineIntegration(manifest, {
  provides: {
    dns: (ctx) =>
      new PowerDnsAdapter(
        new PowerDNSClient({
          apiUrl: ctx.settings.apiUrl,
          apiKey: ctx.secrets.apiKey,
          http: ctx.http,
        }),
      ),
  },
  health: {
    check: async (ctx) => {
      await new PowerDNSClient({
        apiUrl: ctx.settings.apiUrl,
        apiKey: ctx.secrets.apiKey,
        http: ctx.http,
      }).getServerInfo();
      return { status: "ok", checkedAt: new Date() };
    },
  },
  localize: localizePowerDns,
});
