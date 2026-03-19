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
import { PUBLIC_DOMAIN } from "@virtbase/utils";

test.describe("compliance", () => {
  test("it should render the legal notice", async ({ page }) => {
    await page.goto(`${PUBLIC_DOMAIN}/legal/notice`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.url()).toContain("/legal/notice");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("it should render the privacy policy", async ({ page }) => {
    await page.goto(`${PUBLIC_DOMAIN}/legal/privacy`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.url()).toContain("/legal/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("it should render the terms of use", async ({ page }) => {
    await page.goto(`${PUBLIC_DOMAIN}/legal/terms`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.url()).toContain("/legal/terms");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("it should render the revocation policy", async ({ page }) => {
    await page.goto(`${PUBLIC_DOMAIN}/legal/revocation`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.url()).toContain("/legal/revocation");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
