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
import { appUrl } from "../support/urls";

/**
 * The redirect is a cookie-presence check in the proxy, so it needs no session
 * at all - `storageState: undefined` drops the one this project would inherit.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const PROTECTED_PATHS = [
  "/",
  "/servers",
  "/invoices",
  "/account/settings",
  "/account/settings/custom-images",
];

test.describe("unauthenticated app access", () => {
  for (const path of PROTECTED_PATHS) {
    test(`it redirects ${path} to the login page`, async ({ page }) => {
      await page.goto(appUrl(path), { waitUntil: "domcontentloaded" });

      await expect(page).toHaveURL(/\/login/);
    });
  }

  test("it preserves the requested path in the next parameter", async ({
    page,
  }) => {
    await page.goto(appUrl("/servers"), { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/next=%2Fservers/);
  });
});
