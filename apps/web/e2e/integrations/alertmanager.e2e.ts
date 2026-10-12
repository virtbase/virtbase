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

import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  chooseSetting,
  ensureIntegrationDisabled,
  expectSecretsNotServed,
  openIntegration,
  requireConfigStore,
  saveSecrets,
  saveSettings,
  setIntegrationEnabled,
  testSecret,
} from "../support/integrations";
import { publicUrl } from "../support/urls";

const ID = "alertmanager";
const INGEST_TOKEN = testSecret("ingest-token");
const ALERTS_URL = publicUrl("/api/integrations/alertmanager/alerts");

/**
 * One alert in Alertmanager's webhook shape, already resolved: `submitSignal`
 * records a resolved signal and returns before attribution and rule
 * evaluation, so the probe opens no abuse case. The fixed fingerprint is the
 * signal's `externalId`, so a rerun updates the same `abuse_signals` row.
 */
const RESOLVED_ALERT = {
  status: "resolved",
  alerts: [
    {
      status: "resolved",
      labels: { alertname: "VirtbaseE2eProbe", severity: "info" },
      annotations: { summary: "E2E probe of the alerts webhook" },
      fingerprint: "e2e-alertmanager-probe",
    },
  ],
};

const postAlerts = (request: APIRequestContext, token?: string) =>
  request.post(ALERTS_URL, {
    data: RESOLVED_ALERT,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  await requireConfigStore();
  await ensureIntegrationDisabled(browser, ID);
});

test.afterAll(async ({ browser }) => {
  await ensureIntegrationDisabled(browser, ID);
});

test("answers 404 to the ingest token while the integration is off", async ({
  request,
}) => {
  const response = await postAlerts(request, INGEST_TOKEN);

  expect(response.status()).toBe(404);
});

test("stores the payload format and the write-only ingest token from the admin form", async ({
  page,
}) => {
  await openIntegration(page, ID);

  await chooseSetting(page, "Payload format", "alertmanager");
  await chooseSetting(page, "Default severity", "info");
  await saveSettings(page, {});
  await saveSecrets(page, { "Ingest token": INGEST_TOKEN });

  await openIntegration(page, ID);
  await expect(page.getByLabel("Default severity", { exact: true })).toHaveText(
    "info",
  );
  await expectSecretsNotServed(page, ID, [INGEST_TOKEN]);
});

test("switches on without a health probe to run", async ({ page }) => {
  await openIntegration(page, ID);
  await setIntegrationEnabled(page, true);

  await expect(
    page.getByRole("button", { name: "Re-check", exact: true }),
  ).toHaveCount(0);
});

test("accepts an alert batch that carries the ingest token", async ({
  request,
}) => {
  const response = await postAlerts(request, INGEST_TOKEN);

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ accepted: 1 });
});

test("answers 404 to an alert batch without the token while enabled", async ({
  request,
}) => {
  const anonymous = await postAlerts(request);
  const wrongToken = await postAlerts(request, testSecret("wrong-token"));

  expect(anonymous.status()).toBe(404);
  expect(wrongToken.status()).toBe(404);
});

test("answers a real 404 to the ingest token once disabled", async ({
  page,
  request,
}) => {
  await openIntegration(page, ID);
  await setIntegrationEnabled(page, false);

  const response = await postAlerts(request, INGEST_TOKEN);

  expect(response.status()).toBe(404);
});
