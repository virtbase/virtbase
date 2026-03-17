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

import * as z from "zod";

export const EXAMPLE_DATE = "2026-01-01T00:00:00Z";

export const RFC3339LINK =
  "(in [RFC 3339](https://datatracker.ietf.org/doc/html/rfc3339) format)";

export const ObjectTimestampSchema = z.object({
  created_at: z.date().meta({
    description: `The timestamp when the object was created ${RFC3339LINK}.`,
    examples: [EXAMPLE_DATE],
  }),
  updated_at: z.date().meta({
    description: `The timestamp when the object was last updated ${RFC3339LINK}.`,
    examples: [EXAMPLE_DATE],
  }),
  deleted_at: z.date().meta({
    description: `The timestamp when the object was deleted ${RFC3339LINK}.`,
    examples: [EXAMPLE_DATE],
  }),
});
