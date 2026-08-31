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

/**
 * Saved payment credentials.
 *
 * Every function here takes a `db` and a `userId` and scopes its writes by the
 * second - an id arriving from a client is a filter, never a selector. Nothing
 * in this module returns `provider` or `external_id`; see
 * {@link PaymentMethodSummary}.
 */
export * from "./list";
export * from "./provider";
export * from "./record";
export * from "./remove";
export * from "./set-default";
export * from "./settle-stripe-payment-method";
export * from "./settle-stripe-setup-intent";
