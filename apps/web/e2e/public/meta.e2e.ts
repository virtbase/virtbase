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
import { appOrigin, appUrl, publicOrigin, publicUrl } from "../support/urls";

/**
 * The locale `/` redirects to, and the one every `x-default` advertises.
 * Hard-coded rather than imported from `@/i18n/config`: moving the default is a
 * deliberate search decision, and it should not be possible to make it without
 * this test failing.
 */
const X_DEFAULT_LOCALE = "en";

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

  test("it should permanently redirect the root to the x-default locale", async ({
    request,
  }) => {
    const response = await request.get(`${publicOrigin}/`, {
      maxRedirects: 0,
    });

    // A 307 tells a crawler to keep `/` indexed as a URL in its own right
    // rather than fold it into the locale it points at, which leaves the home
    // page competing with itself. Only a permanent redirect consolidates them.
    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe(`/${X_DEFAULT_LOCALE}`);
  });

  test("it should not vary the root redirect by language", async ({
    request,
  }) => {
    // A 308 is cached by the browser indefinitely, so a negotiated target
    // would pin whichever locale a visitor happened to resolve first. Which
    // locale a searcher lands on is hreflang's job.
    for (const acceptLanguage of [
      "de-DE,de;q=0.9",
      "nl-NL,nl;q=0.9",
      "fr-FR,fr;q=0.9",
    ]) {
      const response = await request.get(`${publicOrigin}/`, {
        headers: { "Accept-Language": acceptLanguage },
        maxRedirects: 0,
      });

      expect(response.headers().location).toBe(`/${X_DEFAULT_LOCALE}`);
    }
  });

  test("the sitemap should only list URLs on its own host", async ({
    request,
  }) => {
    const response = await request.get(`${publicOrigin}/sitemap.xml`);
    const locations = [
      ...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g),
    ].flatMap(([, url]) => url ?? []);

    expect(locations.length).toBeGreaterThan(0);
    // A sitemap only speaks for the host that serves it; entries for another
    // host are discarded, and the app domain should not be indexed at all.
    expect(
      locations.filter((url) => !url.startsWith(publicOrigin)),
    ).toStrictEqual([]);
  });

  test("it should keep the app domain out of the index", async ({ page }) => {
    for (const path of ["/login", "/register", "/forgot-password"]) {
      await page.goto(appUrl(path), { waitUntil: "domcontentloaded" });

      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
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
