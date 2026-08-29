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

/** Widget the admin console renders for a field. */
export type FieldWidget =
  | "text"
  | "textarea"
  | "password"
  | "number"
  | "switch"
  | "select"
  | "url";

/**
 * One field of a generated admin form: what to validate it as, and what to
 * draw for it.
 *
 * Lives in Layer 0 rather than next to `defineIntegration`, because two
 * layers need it and only one of them may import the other. Integration
 * settings and secrets are described with it, and so is the configuration of
 * a single notification target - which a `NotificationChannel` in
 * `@virtbase/ports` has to declare, and a port may import nothing above
 * `validators` and `utils`.
 */
export interface FieldDescriptor<TKey extends string = string> {
  /** Must match a key of the sibling schema. */
  key: TKey;
  label: string;
  help?: string;
  widget: FieldWidget;
  placeholder?: string;
  optional?: boolean;
  /** Required when `widget` is `"select"`. */
  options?: { value: string; label: string }[];
}
