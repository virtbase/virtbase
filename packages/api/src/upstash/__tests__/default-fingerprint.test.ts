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
import { defaultFingerprint } from "../default-fingerprint";

describe("defaultFingerprint", () => {
  test("it uses the x-forwarded-for header if it is present", () => {
    expect(
      defaultFingerprint(new Headers({ "x-forwarded-for": "192.168.1.1" })),
    ).toBe("192.168.1.1");

    expect(
      defaultFingerprint(
        new Headers({ "x-forwarded-for": "192.168.1.1, 127.0.0.1" }),
      ),
    ).toBe("192.168.1.1");
  });

  test("it prefers x-real-ip over x-forwarded-for when present", () => {
    expect(
      defaultFingerprint(
        new Headers({
          "x-real-ip": "198.51.100.20",
          "x-forwarded-for": "192.0.2.1, 198.51.100.20",
        }),
      ),
    ).toBe("198.51.100.20");
  });

  test("falls back to unknown when IP headers are empty", () => {
    expect(
      defaultFingerprint(
        new Headers({
          "x-vercel-forwarded-for": "",
          "x-real-ip": "",
          "x-forwarded-for": "",
        }),
      ),
    ).toBe("unknown");
  });
});
