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
import { ADMIN_DOMAIN, APP_DOMAIN } from "@virtbase/utils";
import { absoluteNotificationUrl } from "../deliver";

/**
 * A regression.
 *
 * Notification urls are stored as paths, and Discord answers an embed whose
 * `url` is not absolute with a 400 and `{"embeds": ["0"]}` - which surfaced as
 * "notifications are configured and nothing arrives".
 */
describe("absoluteNotificationUrl", () => {
  test("sends an operator to the admin console", () => {
    expect(absoluteNotificationUrl("/abuse/abus_1", "operator")).toBe(
      `${ADMIN_DOMAIN}/abuse/abus_1`,
    );
  });

  test("sends a customer to their own console", () => {
    // The same stored path, a different host. This is why absolutising cannot
    // happen at the dispatch site: one caller notifies both audiences.
    expect(absoluteNotificationUrl("/abuse/abus_1", "user")).toBe(
      `${APP_DOMAIN}/abuse/abus_1`,
    );
  });

  test("leaves an absolute url alone", () => {
    expect(
      absoluteNotificationUrl("https://status.example.com/x", "operator"),
    ).toBe("https://status.example.com/x");
  });

  test("tolerates a path without its leading slash", () => {
    expect(absoluteNotificationUrl("abuse/abus_1", "operator")).toBe(
      `${ADMIN_DOMAIN}/abuse/abus_1`,
    );
  });

  test("is null when there is nothing to link to", () => {
    expect(absoluteNotificationUrl(null, "operator")).toBeNull();
    expect(absoluteNotificationUrl(undefined, "user")).toBeNull();
    expect(absoluteNotificationUrl("", "operator")).toBeNull();
  });
});
