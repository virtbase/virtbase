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
  setIntegrationEnabled,
  testSecret,
} from "../support/integrations";

const ID = "lexware";
const API_KEY = testSecret("lexware-api-key");

/**
 * Every Lexware call goes to `BASE_URL` in
 * `packages/integration-lexware/src/client.ts`, which no setting overrides, and
 * the health probe is one of those calls. This spec therefore never probes
 * while the integration is on: it covers the configuration, the switch and the
 * probe's answer while off. The invoice flow against a Lexware mock is the E2E
 * of integration-first.md §7.6.
 */
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  await requireConfigStore();
  await ensureIntegrationDisabled(browser, ID);
});

test.afterAll(async ({ browser }) => {
  await ensureIntegrationDisabled(browser, ID);
});

test("stores the write-only API key from the admin form", async ({ page }) => {
  await openIntegration(page, ID);

  await saveSecrets(page, { "API key": API_KEY });

  await openIntegration(page, ID);
  await expectSecretsNotServed(page, ID, [API_KEY]);
});

test("reports not enabled from a health check while switched off", async ({
  page,
}) => {
  await openIntegration(page, ID);
  await recheckHealth(page);

  await expect(healthMessage(page)).toHaveText("Not enabled");
});

test("switches on and off and keeps the stored key", async ({ page }) => {
  await openIntegration(page, ID);
  await setIntegrationEnabled(page, true);

  await openIntegration(page, ID);
  await expect(
    page.getByRole("button", { name: "Disable", exact: true }),
  ).toBeVisible();

  await setIntegrationEnabled(page, false);
  await recheckHealth(page);

  await expect(healthMessage(page)).toHaveText("Not enabled");
  await expect(page.getByLabel("API key", { exact: true })).toHaveAttribute(
    "placeholder",
    /leave blank to keep/,
  );
});
