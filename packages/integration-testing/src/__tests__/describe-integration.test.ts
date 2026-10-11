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

import { resolve } from "node:path";
import { describeIntegration } from "../describe-integration";
import { example } from "./example/integration";

describeIntegration(example, {
  packageDir: resolve(import.meta.dir, "example"),
  config: {
    settings: { apiUrl: "https://provider.example", mode: "test" },
    secrets: { apiKey: "example-secret-key" },
  },
  backend: async (input) =>
    new Response(String(input).endsWith("/status") ? "ok" : "not found", {
      status: String(input).endsWith("/status") ? 200 : 404,
    }),
});
