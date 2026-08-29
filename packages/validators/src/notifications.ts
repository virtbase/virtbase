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

export const NotificationSeveritySchema = z.enum([
  "info",
  "warning",
  "critical",
]);

/**
 * A notification key glob: `*`, a dotted key, or a dotted prefix with a
 * trailing star.
 *
 * Validated rather than accepted as free text so a typo like `abuse:*` fails
 * in the form instead of silently matching nothing for a year.
 */
export const NotificationKeyGlobSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(
    /^(\*|[a-z0-9_]+(\.[a-z0-9_]+)*(\.\*|\*)?)$/,
    "Use a key like `abuse.case.opened`, a prefix like `abuse.*`, or `*` for everything.",
  );

export const NotificationTargetInputSchema = z.object({
  name: z.string().min(1).max(120),
  /** The channel id, e.g. `email`, `discord`, `webhook`. */
  channel: z.string().min(1).max(64),
  enabled: z.boolean(),
  /** At least one: a target that subscribes to nothing is a mistake, not a setting. */
  matchKeys: z.array(NotificationKeyGlobSchema).min(1).max(50),
  minSeverity: NotificationSeveritySchema,
  locale: z.string().min(2).max(10).nullable(),
  /** Non-secret field values from the channel's own descriptor. */
  config: z.record(z.string(), z.string()),
  /**
   * Secret field values. A blank string means "leave the stored value alone",
   * which is what makes the write-only form work.
   */
  secrets: z.record(z.string(), z.string()),
});

export type NotificationTargetInput = z.infer<
  typeof NotificationTargetInputSchema
>;

export const CreateNotificationTargetInputSchema =
  NotificationTargetInputSchema;

export const UpdateNotificationTargetInputSchema =
  NotificationTargetInputSchema.extend({
    id: z.string().min(1),
  });

export type UpdateNotificationTargetInput = z.infer<
  typeof UpdateNotificationTargetInputSchema
>;
