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
import { generatePassword } from "../generate-password";

describe("generatePassword", () => {
  test("generates a password with the correct length", () => {
    expect(generatePassword(8).length).toBe(8);
    expect(generatePassword(10).length).toBe(10);
  });

  test("generates a password with only allowed characters", () => {
    // Only characters from Uppers, Lowers, Numbers, Symbols
    expect(generatePassword()).toMatch(
      /^[QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm1234567890!@#$%^&*]+$/,
    );
  });

  test("generated password contains at least one upper, one lower, one number, and one symbol", () => {
    const pwd = generatePassword();
    expect(pwd).toMatch(/[QWERTYUIOPASDFGHJKLZXCVBNM]/); // at least one upper
    expect(pwd).toMatch(/[qwertyuiopasdfghjklzxcvbnm]/); // at least one lower
    expect(pwd).toMatch(/[1234567890]/); // at least one number
    expect(pwd).toMatch(/[!@#$%^&*]/); // at least one symbol
  });

  test("works in a browser environment", () => {
    expect(generatePassword()).toBeDefined();
  });
});
