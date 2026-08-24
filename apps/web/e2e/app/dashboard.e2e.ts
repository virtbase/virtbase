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
import { mockServer } from "@virtbase/api/testing/fixtures";
import { appUrl } from "../support/urls";

test.describe("authenticated dashboard", () => {
  test("it does not bounce a signed-in user to the login page", async ({
    page,
  }) => {
    await page.goto(appUrl("/"), { waitUntil: "domcontentloaded" });

    // The proxy redirects to /login on a missing session cookie, so simply
    // staying put is the assertion that the storage state works.
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("it sends a signed-in user away from the login page", async ({
    page,
  }) => {
    await page.goto(appUrl("/login"), { waitUntil: "domcontentloaded" });

    await expect(page).not.toHaveURL(/\/login/);
  });

  test("it lists the seeded server", async ({ page }) => {
    await page.goto(appUrl("/servers"), { waitUntil: "domcontentloaded" });

    await expect(page.getByText(mockServer.name)).toBeVisible();
  });

  test("it opens the seeded server's detail page", async ({ page }) => {
    await page.goto(appUrl(`/servers/${mockServer.id}`), {
      waitUntil: "domcontentloaded",
    });

    await expect(page).toHaveURL(new RegExp(mockServer.id));
    await expect(page.getByText(mockServer.name).first()).toBeVisible();
  });

  test("it renders the account settings page", async ({ page }) => {
    await page.goto(appUrl("/account/settings"), {
      waitUntil: "domcontentloaded",
    });

    await expect(page).not.toHaveURL(/\/login/);
  });
});
