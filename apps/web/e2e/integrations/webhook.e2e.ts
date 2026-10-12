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

import { createHmac } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { FakeProvider } from "../support/integrations";
import {
  ADMIN_STORAGE_STATE,
  ensureIntegrationDisabled,
  openAdminPage,
  openIntegration,
  requireConfigStore,
  runServerAction,
  setIntegrationEnabled,
  startFakeProvider,
  testSecret,
} from "../support/integrations";

const ID = "webhook";
const TARGET_NAME = "E2E outgoing webhook";
const SIGNING_SECRET = testSecret("signing-secret");

let receiver: FakeProvider | null = null;

const fakeReceiver = () => {
  if (!receiver) throw new Error("The fake webhook receiver is not running.");
  return receiver;
};

const openNotifications = (page: Page) => openAdminPage(page, "/notifications");

/**
 * The "Send test" button of the edit dialog. Its accessible name is the
 * "Test delivery" label, which `notification-target-dialog.tsx` points at it
 * with `htmlFor="target-test"`.
 */
const sendTestButton = (page: Page) =>
  page
    .getByRole("dialog")
    .getByRole("button", { name: "Test delivery", exact: true });

const targetRow = (page: Page) =>
  page.getByTestId("item-row").filter({ hasText: TARGET_NAME });

/** Deletes every target this spec created, including ones a failed run left. */
const deleteTargets = async (browser: Browser) => {
  const context = await browser.newContext({
    storageState: ADMIN_STORAGE_STATE,
  });
  try {
    const page = await context.newPage();
    await openNotifications(page);
    await expect(
      page.getByRole("button", { name: "Add target", exact: true }),
    ).toBeVisible();

    while ((await targetRow(page).count()) > 0) {
      await runServerAction(page, () =>
        targetRow(page)
          .first()
          .getByRole("button", { name: "Delete", exact: true })
          .click(),
      );
      await openNotifications(page);
      await expect(
        page.getByRole("button", { name: "Add target", exact: true }),
      ).toBeVisible();
    }
  } finally {
    await context.close();
  }
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  await requireConfigStore();
  await ensureIntegrationDisabled(browser, ID);
  await deleteTargets(browser);

  receiver = await startFakeProvider(() => ({ status: 204 }));
});

test.afterAll(async ({ browser }) => {
  await deleteTargets(browser);
  await ensureIntegrationDisabled(browser, ID);
  await receiver?.close();
  receiver = null;
});

test("offers no webhook channel for a target while the integration is off", async ({
  page,
}) => {
  await openNotifications(page);
  await page.getByRole("button", { name: "Add target", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Channel", { exact: true }).click();

  await expect(page.getByRole("option", { name: "email" })).toBeVisible();
  await expect(page.getByRole("option", { name: "webhook" })).toHaveCount(0);
});

test("has nothing to configure on its admin page and switches on", async ({
  page,
}) => {
  await openIntegration(page, ID);
  await expect(
    page.getByText(
      "This integration has nothing to configure here. Switching it on is all there is.",
    ),
  ).toBeVisible();

  await setIntegrationEnabled(page, true);
});

test("delivers a signed test notification to a webhook target", async ({
  page,
}) => {
  await openNotifications(page);
  await page.getByRole("button", { name: "Add target", exact: true }).click();

  const create = page.getByRole("dialog");
  await create.getByLabel("Name", { exact: true }).fill(TARGET_NAME);
  await create.getByLabel("Channel", { exact: true }).click();
  await page.getByRole("option", { name: "webhook", exact: true }).click();
  await create
    .getByLabel("Endpoint URL", { exact: true })
    .fill(`${fakeReceiver().url}/hooks/virtbase`);
  await create
    .getByLabel("Signing secret", { exact: true })
    .fill(SIGNING_SECRET);
  await create.getByLabel("Keys", { exact: true }).fill("e2e.webhook_probe");
  await create.getByRole("button", { name: "Add target", exact: true }).click();
  await expect(create).toHaveCount(0);

  await targetRow(page).getByRole("button", { name: "Edit" }).click();
  await sendTestButton(page).click();
  await expect(page.getByText("Test notification delivered.")).toBeVisible();

  const [delivery, ...rest] = fakeReceiver().requests;
  expect(rest).toHaveLength(0);
  expect(delivery?.method).toBe("POST");
  expect(delivery?.path).toBe("/hooks/virtbase");

  const timestamp = String(delivery?.headers["x-virtbase-timestamp"]);
  const expected = createHmac("sha256", SIGNING_SECRET)
    .update(`${timestamp}.${delivery?.body}`)
    .digest("hex");
  expect(delivery?.headers["x-virtbase-signature"]).toBe(`sha256=${expected}`);
  expect(JSON.parse(delivery?.body ?? "{}")).toMatchObject({
    key: "notifications.test",
    severity: "info",
  });
});

test("marks the target unavailable and cannot send to it once disabled", async ({
  page,
}) => {
  await openIntegration(page, ID);
  await setIntegrationEnabled(page, false);

  await openNotifications(page);
  await expect(targetRow(page)).toContainText("Channel unavailable");

  await targetRow(page).getByRole("button", { name: "Edit" }).click();
  await expect(sendTestButton(page)).toBeDisabled();
  expect(fakeReceiver().requests).toHaveLength(1);
});
