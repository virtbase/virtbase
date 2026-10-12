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
  testSecret,
} from "../support/integrations";
import { publicUrl } from "../support/urls";

const ID = "prometheus";
const PREFIX = "virtbase_e2e_";
const SCRAPE_TOKEN = testSecret("scrape-token");
const SCRAPE_URL = publicUrl("/api/integrations/prometheus/metrics");

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  await requireConfigStore();
  await ensureIntegrationDisabled(browser, ID);
});

test.afterAll(async ({ browser }) => {
  await ensureIntegrationDisabled(browser, ID);
});

test("answers 404 to the scrape token while the integration is off", async ({
  request,
}) => {
  const response = await request.get(SCRAPE_URL, {
    headers: bearer(SCRAPE_TOKEN),
  });

  expect(response.status()).toBe(404);
});

test("stores the prefix and the write-only scrape token from the admin form", async ({
  page,
}) => {
  await openIntegration(page, ID);

  await saveSettings(page, { "Metric prefix": PREFIX });
  await saveSecrets(page, { "Scrape token": SCRAPE_TOKEN });

  await openIntegration(page, ID);
  await expect(page.getByLabel("Metric prefix", { exact: true })).toHaveValue(
    PREFIX,
  );
  await expectSecretsNotServed(page, ID, [SCRAPE_TOKEN]);
});

test("reports not enabled from a health check while switched off", async ({
  page,
}) => {
  await openIntegration(page, ID);
  await recheckHealth(page);

  await expect(healthMessage(page)).toHaveText("Not enabled");
});

test("passes its health check once enabled", async ({ page }) => {
  await openIntegration(page, ID);
  await setIntegrationEnabled(page, true);
  await recheckHealth(page);

  await expect(healthMessage(page)).toHaveCount(0);
});

test("serves metrics under the configured prefix to the bearer of the scrape token", async ({
  request,
}) => {
  const response = await request.get(SCRAPE_URL, {
    headers: bearer(SCRAPE_TOKEN),
  });

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.text()).toMatch(
    new RegExp(`^${PREFIX}platform_collector_up 1$`, "m"),
  );
});

test("answers 404 to a scrape without the token while enabled", async ({
  request,
}) => {
  const anonymous = await request.get(SCRAPE_URL);
  const wrongToken = await request.get(SCRAPE_URL, {
    headers: bearer(testSecret("wrong-token")),
  });

  expect(anonymous.status()).toBe(404);
  expect(wrongToken.status()).toBe(404);
});

test("answers a real 404 to the scrape token once disabled", async ({
  page,
  request,
}) => {
  await openIntegration(page, ID);
  await setIntegrationEnabled(page, false);

  const response = await request.get(SCRAPE_URL, {
    headers: bearer(SCRAPE_TOKEN),
  });

  expect(response.status()).toBe(404);
});
