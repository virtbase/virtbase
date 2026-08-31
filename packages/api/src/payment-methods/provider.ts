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

import type { PaymentProvider } from "@virtbase/ports";
import { integrations } from "../integrations";

/**
 * The integration that holds saved credentials today.
 *
 * Named once rather than spelled at every call site so that the day a second
 * provider can hold a card, the places that have to learn about it are
 * findable. Stored rows carry their own `provider`, so nothing that acts on an
 * existing credential reads this - only the flows that create one.
 */
export const SAVED_CREDENTIAL_PROVIDER_ID = "stripe";

/**
 * The {@link PaymentProvider} methods resolved through this module.
 *
 * `createSetupSession`, `detachPaymentMethod`, `chargeOffSession` and
 * `cancelPayment` are optional on the port on purpose - Anonpay settles a
 * trade the customer initiates and has nothing to store or to hold open, so an
 * adapter that simply lacks the method is a legitimate answer rather than a
 * bug. `retrievePayment` is
 * required and can only be missing if the provider is not enabled at all; it
 * is resolved here anyway so that the collector and the reconciler ask for a
 * capability exactly one way, and so an unconfigured Stripe surfaces as a
 * sentence naming the provider instead of a `TypeError` on `null`.
 */
type OptionalCapability =
  | "createSetupSession"
  | "detachPaymentMethod"
  | "chargeOffSession"
  | "cancelPayment"
  | "retrievePayment";

/**
 * A provider is not enabled, or cannot do the thing that was asked of it.
 *
 * Its own class rather than a bare `Error` so the router can answer
 * `INTERNAL_SERVER_ERROR` for a misconfiguration while letting a genuine
 * provider failure - a Stripe outage mid-detach - surface as itself.
 */
export class PaymentCapabilityUnavailableError extends Error {
  constructor(
    readonly providerId: string,
    readonly capability: OptionalCapability,
    message: string,
  ) {
    super(message);
    this.name = "PaymentCapabilityUnavailableError";
  }
}

/**
 * Resolves one optional capability of a payment provider, bound to it.
 *
 * Goes through the registry rather than importing `@virtbase/integration-stripe`
 * - a router that imports an integration package pins the application to that
 * integration, which is the rule `AGENTS.md` states and
 * `.dependency-cruiser.jsonc` enforces.
 *
 * The three off-session methods on `PaymentProvider` are optional on purpose:
 * Anonpay settles a trade and has nothing to store, so `resolve` can hand back
 * an adapter that simply does not have the method. Reading it off the object
 * and calling it would be a `TypeError` at the far end of a customer action;
 * this turns that into a sentence naming the provider and the capability
 * instead. The bind matters - every adapter method here is written against
 * `this.client`.
 */
export const requirePaymentCapability = async <K extends OptionalCapability>(
  providerId: string,
  capability: K,
): Promise<NonNullable<PaymentProvider[K]>> => {
  const provider = await integrations.resolve("payment", {
    integrationId: providerId,
  });

  if (!provider) {
    throw new PaymentCapabilityUnavailableError(
      providerId,
      capability,
      `The payment provider "${providerId}" is not installed or not enabled.`,
    );
  }

  const method = provider[capability];

  if (!method) {
    throw new PaymentCapabilityUnavailableError(
      providerId,
      capability,
      `The payment provider "${providerId}" does not implement ${capability}.`,
    );
  }

  return method.bind(provider) as NonNullable<PaymentProvider[K]>;
};
