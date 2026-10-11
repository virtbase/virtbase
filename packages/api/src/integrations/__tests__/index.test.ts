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
import { integrationConfigStore, integrations } from "../index";

/** Evaluates `../index.ts` again, as a hot reload in Next's dev server does. */
const evaluateAgain = async (): Promise<object> =>
  import(`../index.ts?evaluation=${crypto.randomUUID()}`);

describe("the integrations composition root", () => {
  test("keeps one registry and one config store when the module is evaluated again", async () => {
    const again = await evaluateAgain();

    expect(Reflect.get(again, "integrations")).toBe(integrations);
    expect(Reflect.get(again, "integrationConfigStore")).toBe(
      integrationConfigStore,
    );
  });
});
