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
import { createId } from "../utils/create-id";

export const emails = d.snakeCase.table(
  "emails",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "email_" })),
    externalId: d.text().unique(),
    from: d.text().notNull(),
    to: d.text().array().notNull(),
    cc: d.text().array(),
    bcc: d.text().array(),
    replyTo: d.text().array(),
    subject: d.text().notNull(),
    html: d.text(),
    text: d.text(),
    tags: d.jsonb(),
    lastEvent: d.text(),
    createdAt: d
      .timestamp({
        withTimezone: true,
        mode: "date",
      })
      .defaultNow()
      .notNull(),
    scheduledAt: d.timestamp({
      withTimezone: true,
      mode: "date",
    }),
  },
  (t) => [
    d.index().on(t.externalId),
    d.index().on(t.from),
    d.index().on(t.to),
    d.index().on(t.lastEvent),
  ],
);

export type DatabaseEmail = typeof emails.$inferSelect;
