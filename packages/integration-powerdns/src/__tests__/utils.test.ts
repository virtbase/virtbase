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
import { buildPtrName } from "../utils";

describe("buildPtrName", () => {
  test("builds a PTR name for an IPv4 address", () => {
    expect(buildPtrName("192.168.1.1", "1.168.192.in-addr.arpa")).toBe(
      "1.1.168.192.in-addr.arpa",
    );
    expect(buildPtrName("192.168.1.1", "168.192.in-addr.arpa")).toBe(
      "1.1.168.192.in-addr.arpa",
    );
  });

  test("builds a PTR name for an RFC2317 zone", () => {
    expect(
      buildPtrName("192.168.1.130", "128/26.1.168.192.in-addr.arpa."),
    ).toBe("130.128/26.1.168.192.in-addr.arpa");
  });

  test("builds a PTR name for an IPv6 address", () => {
    expect(buildPtrName("2001:db8::1", "8.b.d.0.1.0.0.2.ip6.arpa")).toBe(
      "1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa",
    );
    expect(buildPtrName("2001:db8:1002::1", "8.b.d.0.1.0.0.2.ip6.arpa")).toBe(
      "1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.2.0.0.1.8.b.d.0.1.0.0.2.ip6.arpa",
    );
  });

  test("rejects an IPv4 address in a zone that only shares the name's tail", () => {
    expect(() => buildPtrName("10.10.0.5", "0.10.in-addr.arpa")).toThrow(
      "10.10.0.5 is not in the reverse zone 0.10.in-addr.arpa",
    );
  });

  test("rejects an IPv6 address in a zone that only shares the name's tail", () => {
    expect(() =>
      buildPtrName("2001:db8::1", "b.d.0.1.0.0.2.ip6.arpa.x"),
    ).toThrow("is not in the reverse zone");
    expect(() =>
      buildPtrName("2001:db8:1::1", "1.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa"),
    ).not.toThrow();
    expect(() =>
      buildPtrName("2001:db8:11::1", "1.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa"),
    ).toThrow("is not in the reverse zone");
  });

  test("rejects an RFC 2317 zone under another parent", () => {
    expect(() =>
      buildPtrName("192.168.1.5", "0/25.11.168.192.in-addr.arpa"),
    ).toThrow(
      "192.168.1.5 is not in the reverse zone 0/25.11.168.192.in-addr.arpa",
    );
  });

  test("accepts an RFC 2317 host at either end of the delegated range, and rejects one past it", () => {
    expect(buildPtrName("192.168.1.0", "0/25.1.168.192.in-addr.arpa")).toBe(
      "0.0/25.1.168.192.in-addr.arpa",
    );
    expect(buildPtrName("192.168.1.127", "0/25.1.168.192.in-addr.arpa")).toBe(
      "127.0/25.1.168.192.in-addr.arpa",
    );
    expect(() =>
      buildPtrName("192.168.1.128", "0/25.1.168.192.in-addr.arpa"),
    ).toThrow("is not in the reverse zone");
  });
});
