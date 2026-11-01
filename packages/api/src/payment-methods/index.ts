/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Saved payment credentials.
 *
 * Every function here takes a `db` and a `userId` and scopes its writes by the
 * second - an id arriving from a client is a filter, never a selector. Nothing
 * in this module returns `provider` or `external_id`; see
 * {@link PaymentMethodSummary}.
 */
export * from "./list.ts";
export * from "./provider.ts";
export * from "./record.ts";
export * from "./remove.ts";
export * from "./set-default.ts";
export * from "./settle-stripe-payment-method.ts";
export * from "./settle-stripe-setup-intent.ts";
