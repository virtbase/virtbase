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

import { IntegrationRegistry } from "@virtbase/integration-sdk";
import { describeInvoiceProvider } from "@virtbase/integration-testing/ports/invoice";
import lexware from "../index";
import { API_KEY, createFakeLexware } from "./fake-lexware";

const silent = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** The provider as core resolves it: through the registry and `ctx.http`. */
const resolveProvider = async () => {
  const provider = await new IntegrationRegistry({
    integrations: [lexware],
    config: {
      isEnabled: async () => true,
      settings: async () => ({}),
      secrets: async () => ({ apiKey: API_KEY }),
    },
    logger: silent,
    logSink: silent,
    fetch: createFakeLexware(API_KEY).fetch,
  }).resolve("invoice");
  if (!provider) throw new Error("the registry resolved no invoice provider");
  return provider;
};

describeInvoiceProvider("Lexware", async () => ({
  provider: await resolveProvider(),
  address: {
    name: "Ada Lovelace",
    street: "Hauptstraße 1",
    zip: "10115",
    city: "Berlin",
    countryCode: "DE",
  },
}));
