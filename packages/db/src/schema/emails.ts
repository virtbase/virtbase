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

import { index, pgTable } from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";

export const emails = pgTable(
  "emails",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "email_" })),
    externalId: t.text().unique(),
    from: t.text().notNull(),
    to: t.text().array().notNull(),
    cc: t.text().array(),
    bcc: t.text().array(),
    replyTo: t.text().array(),
    subject: t.text().notNull(),
    html: t.text(),
    text: t.text(),
    tags: t.jsonb(),
    lastEvent: t.text(),
    createdAt: t
      .timestamp({
        withTimezone: true,
        mode: "date",
      })
      .defaultNow()
      .notNull(),
    scheduledAt: t.timestamp({
      withTimezone: true,
      mode: "date",
    }),
  }),
  (t) => [
    index().on(t.externalId),
    index().on(t.from),
    index().on(t.to),
    index().on(t.lastEvent),
  ],
);

export type DatabaseEmail = typeof emails.$inferSelect;
