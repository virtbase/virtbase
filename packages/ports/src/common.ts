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
 * Every capability an integration can fill, keyed by the slot name used in
 * {@link https://github.com/virtbase/virtbase `defineIntegration({ provides })`}.
 *
 * The registry indexes adapters by these keys, so a new port means adding a key
 * here and an interface next to it — never editing a core package.
 */
export const PORTS = {
  payment: "payment",
  invoice: "invoice",
  notifications: "notifications",
  dns: "dns",
  metrics: "metrics",
  abuse: "abuse",
  objectStore: "objectStore",
  events: "events",
  identity: "identity",
  serverManagement: "serverManagement",
} as const;

export type PortName = (typeof PORTS)[keyof typeof PORTS];

/**
 * A monetary amount in the currency's smallest unit (cents for EUR/USD), which
 * is how both Stripe and the `transactions` table already store money.
 */
export interface Money {
  /** Amount in the smallest currency unit, e.g. `1250` for EUR 12.50. */
  amount: number;
  /** ISO 4217 code, uppercase. */
  currency: string;
}

/**
 * Thrown by adapters so callers can distinguish "the provider said no" from
 * "the provider is unreachable" without importing a provider SDK.
 */
export class PortError extends Error {
  readonly port: PortName;
  readonly integrationId: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      port: PortName;
      integrationId: string;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "PortError";
    this.port = options.port;
    this.integrationId = options.integrationId;
    this.retryable = options.retryable ?? false;
  }
}
