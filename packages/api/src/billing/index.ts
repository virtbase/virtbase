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
 * Collection: the half of auto-renewal that takes money.
 *
 * `subscriptions/` decides *that* a period is owed and claims it;
 * this decides what happens when the provider is asked for it, and stops the
 * moment a charge is submitted. Everything after that - the payment settling,
 * the term moving, the subscription returning to `active` - belongs to the
 * webhook, `fulfilOrder` and `storeServerExtensionStep`, and is deliberately
 * not repeated here.
 *
 * ## `./collect` is deliberately absent
 *
 * This barrel is a package entry point - `@virtbase/api/billing`, which
 * `apps/web` imports in three cron routes - and `collect.ts` is one of the two
 * modules allowed to read `payment_methods.external_id`, the provider token an
 * off-session charge is made against. `payment-methods/list.ts` and
 * `PaymentMethodSchema` both go out of their way to keep that field off the
 * wire; re-exporting `resolveRenewalPaymentMethod` and `RenewalPaymentMethod`
 * from here would hand any consumer of this entry point a one-line way around
 * both, which is precisely what `collect.ts`'s own "nothing here is ever
 * returned to a router" is trying to prevent.
 *
 * The collector is driven through `renewSubscription`/`retryRenewal`, and the
 * modules that do need a credential import `./collect` by path. So the barrel
 * stops at the sweep drivers, and a caller that wants the token has to reach
 * into the package to get it - which is a reviewable act rather than an
 * accident.
 *
 * There is exactly one such caller outside this directory:
 * `router/subscriptions.ts`'s `usablePaymentMethodId` asks
 * `resolveRenewalPaymentMethod` which credential a renewal would charge, so
 * that the switch and the collector cannot answer that question differently.
 * It reduces the answer to a boolean and never lets the credential out. Any
 * further reach-in deserves the same scrutiny.
 */
export * from "./due-renewals";
export * from "./dunning-mail";
export * from "./reconcile-renewals";
export * from "./record-outcome";
export * from "./renew-subscription";
export * from "./retry-schedule";
