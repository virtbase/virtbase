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
import { appOrigin, publicOrigin, publicUrl } from "../support/urls";

test.describe("meta", () => {
  // robots, sitemap and security.txt must be served on both hosts.
  const origins = [publicOrigin, appOrigin];

  test("it should render the robots.txt", async ({ page }) => {
    for (const domain of origins) {
      const url = `${domain}/robots.txt`;
      const response = await page.goto(url, { waitUntil: "commit" });
      expect(response?.status()).toBe(200);
      expect(response?.headers()["content-type"]).toContain("text/plain");
    }
  });

  test("it should render the sitemap.xml", async ({ page }) => {
    for (const domain of origins) {
      const url = `${domain}/sitemap.xml`;
      const response = await page.goto(url, { waitUntil: "commit" });
      expect(response?.status()).toBe(200);
      expect(response?.headers()["content-type"]).toContain("application/xml");
    }
  });

  test("it should render the security.txt", async ({ page }) => {
    for (const domain of origins) {
      const url = `${domain}/.well-known/security.txt`;
      const response = await page.goto(url, { waitUntil: "commit" });
      expect(response?.status()).toBe(200);
      expect(response?.headers()["content-type"]).toContain("text/plain");
    }
  });

  test("it should render the custom not found page", async ({ page }) => {
    const response = await page.goto(
      publicUrl(`/some-random-non-existent-page`),
      { waitUntil: "domcontentloaded" },
    );

    expect(response?.status()).toBe(404);

    const heading = page.getByTestId("empty-title");
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText("404");
  });
});
