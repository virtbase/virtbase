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

import * as d from "drizzle-orm/pg-core";
import { discounts } from "./discounts";
import { serverPlans } from "./server-plans";

export const discountsToServerPlans = d.snakeCase.table(
  "discounts_to_server_plans",
  {
    discountId: d
      .text()
      .notNull()
      .references(() => discounts.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    serverPlanId: d
      .text()
      .notNull()
      .references(() => serverPlans.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (t) => [d.primaryKey({ columns: [t.discountId, t.serverPlanId] })],
);
