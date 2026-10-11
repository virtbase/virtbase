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
import { describeIntegration } from "@virtbase/integration-testing";
import prometheus from "../index";
import { createFakeReader, fakeCore, SNAPSHOT } from "./fake-core";

describeIntegration(prometheus, {
  packageDir: resolve(import.meta.dir, "../.."),
  config: {
    settings: { collectDefaultMetrics: "false" },
    secrets: { scrapeToken: "prometheus-conformance-token-0123456789" },
  },
  healthReachesProvider: false,
  alongside: [fakeCore(createFakeReader(SNAPSHOT))],
});
