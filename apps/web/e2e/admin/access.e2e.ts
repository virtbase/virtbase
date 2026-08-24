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
import { adminUrl } from "../support/urls";

test.describe("admin access", () => {
  test("it lets an admin reach the console", async ({ page }) => {
    await page.goto(adminUrl("/"), { waitUntil: "domcontentloaded" });

    await expect(page).not.toHaveURL(/\/login/);
  });

  test("it reaches the integrations hub", async ({ page }) => {
    await page.goto(adminUrl("/integrations"), {
      waitUntil: "domcontentloaded",
    });

    await expect(page).not.toHaveURL(/\/login/);
  });
});

test.describe("admin access for a customer", () => {
  // A non-admin gets a 404 rather than a 401 - the console is hidden, not
  // merely locked. See `AdminMiddleware` and `verifySession()`.
  test.use({ storageState: "e2e/.auth/customer.json" });

  test("it hides the console from a signed-in customer", async ({ page }) => {
    const response = await page.goto(adminUrl("/"), {
      waitUntil: "domcontentloaded",
    });

    expect(response?.status()).toBe(404);
  });
});
