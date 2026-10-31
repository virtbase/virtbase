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

import { describe, expect, test } from "bun:test";
import { contentSecurityPolicy } from "..";

const directives = new Map(
  contentSecurityPolicy.split("; ").map((directive) => {
    const [name = "", ...sources] = directive.split(" ");
    return [name, sources];
  }),
);

describe("contentSecurityPolicy", () => {
  test("forbids framing the app on another origin", () => {
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
  });

  test("allows scripts from this origin without eval outside development", () => {
    const scripts = directives.get("script-src");

    expect(scripts).toContain("'self'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  test("keeps default-src, base-uri and form-action on this origin", () => {
    expect(directives.get("default-src")).toEqual(["'self'"]);
    expect(directives.get("base-uri")).toEqual(["'self'"]);
    expect(directives.get("form-action")).toEqual(["'self'"]);
  });

  test("upgrades insecure requests outside development", () => {
    expect(directives.has("upgrade-insecure-requests")).toBe(true);
  });

  test("merges every policy's sources into one sorted list without duplicates", () => {
    const images = directives.get("img-src") ?? [];

    expect(images).toEqual([...new Set(images)].sort());
    expect(images).toContain("https://*.stripe.com");
    expect(images).toContain("https://vercel.com");
  });

  test("lets Stripe and the console frame load", () => {
    expect(directives.get("frame-src")).toContain("https://js.stripe.com");
    expect(directives.get("frame-src")).toContain(
      "https://novnc.com/noVNC/vnc.html",
    );
  });
});
