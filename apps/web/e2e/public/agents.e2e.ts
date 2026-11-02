/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { expect, test } from "@playwright/test";
import { publicUrl } from "../support/urls.ts";

// What an agent, or a scanner such as isitagentready.com, looks for.
test.describe("agents", () => {
  test("a page asked for as Markdown is served as Markdown", async ({
    request,
  }) => {
    const response = await request.get(publicUrl("/en"), {
      headers: { Accept: "text/markdown" },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/markdown");
    expect(response.headers().vary).toContain("Accept");

    const html = await request.get(publicUrl("/en"));
    expect(html.headers()["content-type"]).toContain("text/html");
  });

  test("the home page links the API catalog and llms.txt", async ({
    request,
  }) => {
    const link = (await request.get(publicUrl("/en"))).headers().link ?? "";
    for (const rel of ["api-catalog", "service-desc", "describedby"]) {
      expect(link).toContain(`rel="${rel}"`);
    }
  });

  test("the API catalog points at the OpenAPI document", async ({
    request,
  }) => {
    const catalog = await request.get(publicUrl("/.well-known/api-catalog"));
    expect(catalog.headers()["content-type"]).toContain(
      "application/linkset+json",
    );
    const [entry] = (await catalog.json()).linkset;
    const { pathname } = new URL(entry["service-desc"][0].href);
    expect(pathname).toBe("/api/openapi.json");

    // Fetched through the origin under test: the catalog's URLs are absolute,
    // on the production domain.
    const spec = await request.get(publicUrl(pathname));
    expect(spec.status()).toBe(200);
    expect((await spec.json()).openapi).toMatch(/^3\./);
  });

  test("llms.txt is served", async ({ request }) => {
    const response = await request.get(publicUrl("/llms.txt"));
    expect(response.status()).toBe(200);
    expect(await response.text()).toMatch(/^# /);
  });
});
