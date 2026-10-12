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
  openIntegration,
  requireConfigStore,
  saveSecrets,
  saveSettings,
  testSecret,
} from "../support/integrations";

const ID = "abuseipdb";
const API_KEY = testSecret("abuseipdb-api-key");

/**
 * The `onEnable` hook of `packages/integration-abuseipdb/src/index.ts` checks
 * the key with a `/check` call to `API_BASE` in its `client.ts`, which no
 * setting overrides. Switching AbuseIPDB on therefore always reaches the
 * provider, so this spec never does: it covers the configuration, and that the
 * admin page offers no health probe.
 */
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  await requireConfigStore();
  await ensureIntegrationDisabled(browser, ID);
});

test.afterAll(async ({ browser }) => {
  await ensureIntegrationDisabled(browser, ID);
});

test("stores the sweep settings and the write-only API key from the admin form", async ({
  page,
}) => {
  await openIntegration(page, ID);

  await saveSettings(page, {
    "Confidence threshold": "75",
    "Report age": "14",
    "Calls per run": "2",
  });
  await saveSecrets(page, { "API key": API_KEY });

  await openIntegration(page, ID);
  await expect(
    page.getByLabel("Confidence threshold", { exact: true }),
  ).toHaveValue("75");
  await expect(page.getByLabel("Report age", { exact: true })).toHaveValue(
    "14",
  );
  await expect(page.getByLabel("Calls per run", { exact: true })).toHaveValue(
    "2",
  );
  await expectSecretsNotServed(page, ID, [API_KEY]);
});

test("offers no health check, because every AbuseIPDB call spends quota", async ({
  page,
}) => {
  await openIntegration(page, ID);

  await expect(
    page.getByRole("button", { name: "Re-check", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Enable", exact: true }),
  ).toBeVisible();
});
