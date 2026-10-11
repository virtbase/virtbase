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
import { isProductionDeployment } from "../is-production-deployment";

describe("isProductionDeployment", () => {
  test("is true for the production deployment", () => {
    expect(isProductionDeployment("production")).toBe(true);
  });

  test("is false for a preview, although its build runs with NODE_ENV=production", () => {
    expect(isProductionDeployment("preview")).toBe(false);
  });

  test("is false when the deployment environment is not set", () => {
    expect(isProductionDeployment(undefined)).toBe(false);
  });
});
