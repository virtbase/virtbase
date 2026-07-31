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

import { describe, expect, test } from "bun:test";
import {
  ADMIN_HOSTNAMES,
  APP_HOSTNAMES,
  PUBLIC_HOSTNAMES,
} from "../../constants/main";
import { getSafeRedirectUrl } from "../get-safe-redirect-url";

describe("getSafeRedirectUrl", () => {
  test("returns fallback for empty values", () => {
    expect(getSafeRedirectUrl(null)).toBe("/");
    expect(getSafeRedirectUrl(undefined)).toBe("/");
    expect(getSafeRedirectUrl("")).toBe("/");
    expect(getSafeRedirectUrl("   ")).toBe("/");
    expect(getSafeRedirectUrl(null, "/dashboard")).toBe("/dashboard");
  });

  test("allows relative paths", () => {
    expect(getSafeRedirectUrl("/")).toBe("/");
    expect(getSafeRedirectUrl("/dashboard")).toBe("/dashboard");
    expect(getSafeRedirectUrl("/servers?tab=1")).toBe("/servers?tab=1");
    expect(getSafeRedirectUrl("/account/settings#security")).toBe(
      "/account/settings#security",
    );
  });

  test("rejects open redirect payloads", () => {
    expect(getSafeRedirectUrl("https://evil.example/phish")).toBe("/");
    expect(getSafeRedirectUrl("//evil.example/phish")).toBe("/");
    expect(getSafeRedirectUrl("/\\evil.example")).toBe("/");
    expect(getSafeRedirectUrl("\\\\evil.example")).toBe("/");
    expect(getSafeRedirectUrl("javascript:alert(1)")).toBe("/");
    expect(getSafeRedirectUrl("http://evil.example")).toBe("/");
    expect(getSafeRedirectUrl("evil.example")).toBe("/");
  });

  test("allows absolute URLs on trusted local hosts", () => {
    // Only test a few for brevity, but ensure at least one for each type if possible
    const cases = [
      ...(PUBLIC_HOSTNAMES ?? []),
      ...(APP_HOSTNAMES ?? []),
      ...(ADMIN_HOSTNAMES ?? []),
    ]
      .filter(Boolean)
      .slice(0, 3); // Just test a sample of up to 3 to keep the test light

    for (const host of cases) {
      const url = `http://${host}/some/path?query=1#fragment`;
      expect(getSafeRedirectUrl(url)).toBe(url);
    }
  });
});
