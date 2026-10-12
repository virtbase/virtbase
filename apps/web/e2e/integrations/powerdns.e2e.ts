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

import { expect, test } from "@playwright/test";
import type { FakeProvider } from "../support/integrations";
import {
  ensureIntegrationDisabled,
  expectSecretsNotServed,
  healthMessage,
  openIntegration,
  recheckHealth,
  requireConfigStore,
  saveSecrets,
  saveSettings,
  setIntegrationEnabled,
  startFakeProvider,
  testSecret,
} from "../support/integrations";

const ID = "powerdns";
const API_KEY = testSecret("powerdns-api-key");
const SERVER_INFO = "/api/v1/servers/localhost";

let powerdns: FakeProvider | null = null;

const fakePowerDns = () => {
  if (!powerdns) throw new Error("The fake PowerDNS server is not running.");
  return powerdns;
};

const serverInfoRequests = () =>
  fakePowerDns().requests.filter((request) => SERVER_INFO === request.path);

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  await requireConfigStore();
  await ensureIntegrationDisabled(browser, ID);

  powerdns = await startFakeProvider((request) =>
    SERVER_INFO === request.path && API_KEY === request.headers["x-api-key"]
      ? { status: 200, json: { id: "localhost", version: "e2e" } }
      : { status: 401, json: { error: "Unauthorized" } },
  );
});

test.afterAll(async ({ browser }) => {
  await ensureIntegrationDisabled(browser, ID);
  await powerdns?.close();
  powerdns = null;
});

test("stores the API URL and the write-only API key from the admin form", async ({
  page,
}) => {
  await openIntegration(page, ID);

  await saveSettings(page, { "API URL": fakePowerDns().url });
  await saveSecrets(page, { "API key": API_KEY });

  await openIntegration(page, ID);
  await expect(page.getByLabel("API URL", { exact: true })).toHaveValue(
    fakePowerDns().url,
  );
  await expectSecretsNotServed(page, ID, [API_KEY]);
});

test("reports not enabled from a health check while switched off, without calling PowerDNS", async ({
  page,
}) => {
  await openIntegration(page, ID);
  await recheckHealth(page);

  await expect(healthMessage(page)).toHaveText("Not enabled");
  expect(serverInfoRequests()).toHaveLength(0);
});

test("reads the server info with the stored API key once enabled", async ({
  page,
}) => {
  await openIntegration(page, ID);
  await setIntegrationEnabled(page, true);
  await recheckHealth(page);

  await expect(healthMessage(page)).toHaveCount(0);
  expect(serverInfoRequests()).toHaveLength(1);
  expect(serverInfoRequests()[0]?.method).toBe("GET");
});

test("stops calling PowerDNS once disabled", async ({ page }) => {
  await openIntegration(page, ID);
  await setIntegrationEnabled(page, false);
  await recheckHealth(page);

  await expect(healthMessage(page)).toHaveText("Not enabled");
  expect(serverInfoRequests()).toHaveLength(1);
});
