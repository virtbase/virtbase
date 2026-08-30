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
import { initAuth } from "../index";
import { apiKeyOptions } from "../plugins";

/**
 * Providers that report an email address they have not verified.
 *
 * GitHub reads `verified` off the address itself and Discord off the account;
 * both can be false. Listing either as trusted tells Better Auth to link its
 * identity to an existing Virtbase account with the same address anyway, which
 * is the whole of the OAuth account-takeover primitive.
 */
const UNRELIABLE_PROVIDERS = ["github", "discord"];

describe("account linking", () => {
  const { accountLinking } = initAuth().options.account ?? {};

  test("no provider that can report an unverified email is trusted", () => {
    const trusted = accountLinking?.trustedProviders ?? [];

    for (const provider of UNRELIABLE_PROVIDERS) {
      expect(trusted).not.toContain(provider);
    }
  });

  test("linking is still enabled, and still implicit for Google", () => {
    // Narrowing the list must not turn into disabling the feature: a Google
    // identity whose address matches an existing account still links.
    expect(accountLinking?.enabled).toBe(true);
    expect(accountLinking?.trustedProviders).toContain("google");
  });

  test("different addresses stay allowed", () => {
    // Only reachable from `/link-social`, which needs a signed-in customer who
    // asked for it - a Discord account rarely carries the billing address.
    expect(accountLinking?.allowDifferentEmails).toBe(true);
  });
});

describe("API keys", () => {
  test("a key created without an expiry still gets one", () => {
    // Better Auth defaults `defaultExpiresIn` to null, and nothing in the app
    // passes `expiresIn`, so every key ever issued was immortal.
    const { defaultExpiresIn } = apiKeyOptions.keyExpiration;

    expect(defaultExpiresIn).toBeNumber();
    expect(defaultExpiresIn).toBeGreaterThan(0);
  });

  test("that expiry is at most the year Better Auth allows", () => {
    // `keyExpiration.maxExpiresIn` defaults to 365 days; a longer default
    // would be a value a caller could not have asked for.
    expect(apiKeyOptions.keyExpiration.defaultExpiresIn).toBeLessThanOrEqual(
      60 * 60 * 24 * 365,
    );
  });
});
